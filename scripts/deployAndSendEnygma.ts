import { ethers } from "ethers";
import * as path from "path";

import {
  log,
  logSuccess,
  logInfo,
  logStep,
  logError,
  setupWalletAndProvider,
  deployContract,
  getContractInstance,
  waitForTx,
} from "./utils";

function genRanHex(size: number) {
  return [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");
}

const ccConfig = require(path.join(__dirname, "../config.cc.json"));
const deployerConfig = require(path.join(__dirname, "../config.deployer.json"));
const receiverConfig = require(path.join(__dirname, "../config.receiver.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const ccProxyRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const tokenRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

async function pollCondition(
  condition: () => Promise<boolean>,
  interval: number,
  maxAttempts: number
): Promise<boolean> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }
  return false;
}

async function main() {
  const randHexSuffix = genRanHex(6);
  const tokenName = deployerConfig.token.name + `_${randHexSuffix}`;
  const tokenSymbol = deployerConfig.token.symbol + `_${randHexSuffix}`;
  const deployerPrivateKey = deployerConfig.deployer.privateKey;
  const rpcUrl = deployerConfig.deployer.rpcUrl;
  const chainId = deployerConfig.deployer.chainId;
  const endpointAddress = deployerConfig.deployer.endpointAddress;

  const ccRpcUrl = ccConfig.commitChain.rpcUrl;
  const ccChainId = ccConfig.commitChain.chainId;
  const ccPrivateKey = ccConfig.commitChain.privateKey;
  const ccProxyRegistryAddress = ccConfig.commitChain.ccDeploymentProxyRegistry;

  const receiverRpcUrl = receiverConfig.receiver.rpcUrl;
  const receiverChainId = receiverConfig.receiver.chainId;
  const receiverPrivateKey = receiverConfig.receiver.privateKey;

  const ZERO_GAS_SETUP = {
    gasPrice: 0,
    gasLimit: 30000000,
  };

  log(`\n--- 🚀 Iniciando o Processo de Deploy e Registro de Token ---`);
  logInfo(`Configurações carregadas.`);
  logInfo(`Nome do Token: ${tokenName}`);
  logInfo(`Símbolo do Token: ${tokenSymbol}`);
  logInfo(`Chain ID Principal: ${chainId}`);
  logInfo(`RPC URL Principal: ${rpcUrl}`);
  logInfo(`Endereço do Endpoint (Construtor): ${endpointAddress}`);

  try {
    logStep(`\n1. Configurando Provedores e Wallets...`);
    const { provider, wallet: deployerWallet } = await setupWalletAndProvider(
      rpcUrl,
      chainId,
      deployerPrivateKey,
      "Deployer"
    );
    const { provider: receiverProvider, wallet: receiverWallet } =
      await setupWalletAndProvider(
        receiverRpcUrl,
        receiverChainId,
        receiverPrivateKey,
        "Receiver"
      );
    const receiverAddress = receiverWallet.address;
    const { provider: ccProvider, wallet: ccWallet } =
      await setupWalletAndProvider(
        ccRpcUrl,
        ccChainId,
        ccPrivateKey,
        "Commit Chain Deployer"
      );

    const enygmaToken = await deployContract(
      EnygmaTokenArtifact,
      deployerWallet,
      [tokenName, tokenSymbol, endpointAddress],
      tokenName
    );
    const enygmaTokenAddress = enygmaToken.address;

    const enygmaTokenContract = await getContractInstance(
      enygmaTokenAddress,
      EnygmaTokenArtifact.abi,
      deployerWallet,
      provider,
      chainId,
      tokenName
    );

    logStep(`\n2. Chamando submitTokenRegistration(2) no ${tokenName}...`);
    await enygmaTokenContract.submitTokenRegistration(2, ZERO_GAS_SETUP);

    logStep(`\n3. Aprovando Token no TokenRegistry da Commit Chain...`);
    const ccProxyRegistryContract = await getContractInstance(
      ccProxyRegistryAddress,
      ccProxyRegistryArtifact.abi,
      ccWallet,
      ccProvider,
      ccChainId,
      "Commit Chain Proxy Registry"
    );

    const deployment = await ccProxyRegistryContract.getDeployment();
    logInfo(`  Endereço do Token Registry: ${deployment.tokenRegistryAddress}`);

    const tokenRegistryContract = await getContractInstance(
      deployment.tokenRegistryAddress,
      tokenRegistryArtifact.abi,
      ccWallet,
      ccProvider,
      ccChainId,
      "Token Registry"
    );

    logInfo(`  Aguardando o token '${tokenName}' aparecer no TokenRegistry...`);

    let tokenResourceId: string | undefined = undefined;
    const tokenFound = await pollCondition(
      async (): Promise<boolean> => {
        const allTokens = await tokenRegistryContract.getAllTokens();
        const foundToken = allTokens.find(
          (token: any) =>
            token.name === tokenName && token.symbol === tokenSymbol
        );
        if (foundToken) {
          tokenResourceId = foundToken.resourceId;
          return true;
        }
        return false;
      },
      10000,
      30
    );

    if (!tokenFound || !tokenResourceId) {
      throw new Error(
        `Token ${tokenName} com símbolo ${tokenSymbol} não encontrado no TokenRegistry após o tempo limite.`
      );
    }

    logSuccess(
      `Token encontrado no TokenRegistry com Resource ID: ${tokenResourceId}`
    );

    logInfo(
      `  Enviando transação para atualizar status do token para APROVADO (1)...`
    );
    await tokenRegistryContract.updateStatus(
      tokenResourceId,
      1,
      ZERO_GAS_SETUP
    );

    logInfo(
      `  Aguardando o status do token '${tokenName}' ser atualizado para APROVADO...`
    );
    const statusApproved = await pollCondition(
      async (): Promise<boolean> => {
        const allTokens = await tokenRegistryContract.getAllTokens();
        const updatedToken = allTokens.find(
          (token: any) => token.resourceId === tokenResourceId
        );
        return updatedToken && updatedToken.status == BigInt(1);
      },
      10000,
      30
    );

    if (!statusApproved) {
      throw new Error(
        `Status do Token ${tokenName} não foi atualizado para APROVADO após o tempo limite.`
      );
    }
    logSuccess(`Status do Token ${tokenName} atualizado para APROVADO.`);

    logStep(`\n4. Verificando propriedades do contrato deployado...`);
    const deployedName = await enygmaTokenContract.name();
    const deployedSymbol = await enygmaTokenContract.symbol();
    logInfo(`  - Nome do Token: ${deployedName}`);
    logInfo(`  - Símbolo do Token: ${deployedSymbol}`);
    logInfo(`  - Endereço do Deployer: ${deployerWallet.address}`);

    logStep(`\n5. Mintando 1000 tokens para o deployer...`);
    const mintAmount = ethers.utils.parseEther("1000");

    logInfo(
      `  Mintando ${ethers.utils.formatEther(
        mintAmount
      )} ${tokenSymbol} para o Deployer...`
    );

    const mintTx = await enygmaTokenContract.mint(
      deployerWallet.address,
      mintAmount
    );
    await waitForTx(
      mintTx,
      1,
      `Mint de 1000 tokens para ${deployerWallet.address}`
    );

    const deployerBalanceAfterMint = await enygmaTokenContract.balanceOf(
      deployerWallet.address
    );
    logInfo(
      `  Saldo do Deployer após mint: ${ethers.utils.formatEther(
        deployerBalanceAfterMint
      )} ${tokenSymbol}`
    );

    logStep(`\n6. Teleportando 100 tokens para o receiver...`);
    logInfo(`  Endereço do Receiver: ${receiverAddress}`);
    logInfo(`  Chain ID do Receiver: ${receiverChainId}`);

    const teleportAmount = ethers.utils.parseEther("100");

    const teleportTx = await enygmaTokenContract.crossTransfer(
      [receiverAddress],
      [teleportAmount],
      [receiverChainId],
      [[]]
    );
    await waitForTx(
      teleportTx,
      1,
      `Teleport de ${ethers.utils.formatEther(
        teleportAmount
      )} tokens para ${receiverAddress}`
    );

    log(`\n--- ✨ Deploy e Registro de Token Finalizados com Sucesso! ---`);
  } catch (error) {
    logError(`\nFalha durante a operação de Deploy e Registro de Token:`);
    if (error instanceof Error) {
      logError(`Mensagem: ${error.message}`);
      if ("code" in error && (error as any).code === "CALL_EXCEPTION") {
        logError(
          `Detalhes de Revert EVM: ${JSON.stringify(
            (error as any).data || (error as any).reason
          )}`
        );
      } else if ("code" in error && (error as any).code === "NETWORK_ERROR") {
        logError(`Erro de Rede: Verifique sua RPC URL ou conexão.`);
        logInfo(`  RPC URL principal: ${rpcUrl}`);
      } else if (
        "code" in error &&
        (error as any).code === "UNSUPPORTED_OPERATION"
      ) {
        logError(
          `Operação não suportada pelo provedor RPC. Verifique a compatibilidade.`
        );
      }
    } else {
      logError(`Erro desconhecido: ${error}`);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
