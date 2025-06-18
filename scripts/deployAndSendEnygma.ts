import { ethers } from "hardhat";
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

async function main() {
  const randomSuffix = Math.floor(Math.random() * 100000).toString();
  const tokenName = deployerConfig.token.name + `_${randomSuffix}`;
  const tokenSymbol = deployerConfig.token.symbol + `_${randomSuffix}`;
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
    const enygmaTokenAddress = await enygmaToken.getAddress();

    const enygmaTokenContract = await getContractInstance(
      enygmaTokenAddress,
      EnygmaTokenArtifact.abi,
      deployerWallet,
      provider,
      chainId,
      tokenName
    );

    logStep(`\n3. Chamando submitTokenRegistration(2) no ${tokenName}...`);
    const submitTx = await enygmaTokenContract.submitTokenRegistration(2);
    await waitForTx(submitTx, 6, `submitTokenRegistration para ${tokenName}`);

    logStep(`\n4. Aprovando Token no TokenRegistry da Commit Chain...`);
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

    const allTokens = await tokenRegistryContract.getAllTokens();
    const tokenFromRegistry = allTokens.find(
      (token: any) => token.name === tokenName && token.symbol === tokenSymbol
    );

    if (!tokenFromRegistry) {
      throw new Error(
        `Token ${tokenName} com símbolo ${tokenSymbol} não encontrado no TokenRegistry.`
      );
    }

    logSuccess(
      `Token encontrado no TokenRegistry: ${tokenFromRegistry.name} (${tokenFromRegistry.symbol})`
    );
    logInfo(`  Resource ID do Token: ${tokenFromRegistry.resourceId}`);

    logInfo(`  Atualizando status do token para APROVADO (1)...`);
    const approveTx = await tokenRegistryContract.updateStatus(
      tokenFromRegistry.resourceId,
      1
    );
    await waitForTx(approveTx, 6, `Aprovação de ${tokenName} no TokenRegistry`);

    logStep(`\n5. Verificando propriedades do contrato deployado...`);
    const deployedName = await enygmaTokenContract.name();
    const deployedSymbol = await enygmaTokenContract.symbol();
    logInfo(`  - Nome do Token: ${deployedName}`);
    logInfo(`  - Símbolo do Token: ${deployedSymbol}`);
    logInfo(`  - Endereço do Deployer: ${deployerWallet.address}`);

    logStep(`\n6. Mintando 1000 tokens para o deployer...`);
    const mintAmount = ethers.parseEther("1000");

    logInfo(
      `  Mintando ${ethers.formatEther(
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
      `  Saldo do Deployer após mint: ${ethers.formatEther(
        deployerBalanceAfterMint
      )} ${tokenSymbol}`
    );

    logStep(`\n7. Teleportando 100 tokens para o receiver...`);
    logInfo(`  Endereço do Receiver: ${receiverAddress}`);
    logInfo(`  Chain ID do Receiver: ${receiverChainId}`);

    const teleportTx = await enygmaTokenContract.crossTransfer(
      [receiverAddress],
      [ethers.parseEther("100")],
      [receiverChainId],
      [[]]
    );
    await waitForTx(
      teleportTx,
      1,
      `Teleport de 100 tokens para ${receiverAddress}`
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