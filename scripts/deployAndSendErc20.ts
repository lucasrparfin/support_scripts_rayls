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

const ccConfig = require(path.join(__dirname, "../config.cc.json"));
const deployerConfig = require(path.join(__dirname, "../config.deployer.json"));
const receiverConfig = require(path.join(__dirname, "../config.receiver.json"));

const PlaygroundErc20Artifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/PlaygroundErc20.sol/PlaygroundErc20.json"
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

    const playgroundErc20 = await deployContract(
      PlaygroundErc20Artifact,
      deployerWallet,
      [tokenName, tokenSymbol, endpointAddress],
      tokenName
    );
    const deployedErc20Address = playgroundErc20.address;

    const playgroundErc20Contract = await getContractInstance(
      deployedErc20Address,
      PlaygroundErc20Artifact.abi,
      deployerWallet,
      provider,
      chainId,
      tokenName
    );

    logStep(`\n3. Chamando submitTokenRegistration(2) no ${tokenName}...`);
    const submitTx = await playgroundErc20Contract.submitTokenRegistration(2);
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

    let ccNonce = await ccWallet.getTransactionCount();
    logInfo(`  Nonce atual para Commit Chain: ${ccNonce}`);

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
      1,
      {
        gasPrice: 0,
        nonce: ccNonce,
      }
    );
    await waitForTx(approveTx, 6, `Aprovação de ${tokenName} no TokenRegistry`);

    logStep(`\n5. Verificando propriedades do contrato deployado...`);
    const deployedName = await playgroundErc20Contract.getName();
    const deployedSymbol = await playgroundErc20Contract.getSymbol();
    logInfo(`  - Nome do Token: ${deployedName}`);
    logInfo(`  - Símbolo do Token: ${deployedSymbol}`);
    logInfo(`  - Endereço do Deployer: ${deployerWallet.address}`);

    logStep(`\n6. Mintando 1000 tokens para o deployer...`);
    const mintAmount = ethers.utils.parseEther("1000");

    logInfo(
      `  Mintando ${ethers.utils.formatEther(
        mintAmount
      )} ${tokenSymbol} para o Deployer...`
    );

    const mintTx = await playgroundErc20Contract.mint(
      deployerWallet.address,
      mintAmount
    );
    await waitForTx(
      mintTx,
      1,
      `Mint de 1000 tokens para ${deployerWallet.address}`
    );

    const deployerBalanceAfterMint = await playgroundErc20Contract.balanceOf(
      deployerWallet.address
    );
    logInfo(
      `  Saldo do Deployer após mint: ${ethers.utils.formatEther(
        deployerBalanceAfterMint
      )} ${tokenSymbol}`
    );

    logStep(`\n7. Teleportando 100 tokens para o receiver...`);
    logInfo(`  Endereço do Receiver: ${receiverAddress}`);
    logInfo(`  Chain ID do Receiver: ${receiverChainId}`);

    const teleportAmount = ethers.utils.parseEther("100");

    const teleportTx = await playgroundErc20Contract.teleportAtomic(
      receiverAddress,
      teleportAmount,
      receiverChainId
    );
    await waitForTx(
      teleportTx,
      1,
      `Teleport de ${ethers.utils.formatEther(teleportAmount)} tokens para ${receiverAddress}`
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