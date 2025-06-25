import { ethers } from "ethers";
import * as path from "path";

import {
  log,
  logSuccess,
  logInfo,
  logStep,
  logError,
  setupWalletAndProvider,
  getContractInstance,
  waitForTx,
} from "./utils";

const deployerConfig = require(path.join(__dirname, "../config.deployer.json"));
const receiverConfig = require(path.join(__dirname, "../config.receiver.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

async function main() {

  const deployerPrivateKey = deployerConfig.deployer.privateKey;
  const deployerRpcUrl = deployerConfig.deployer.rpcUrl;
  const deployerChainId = deployerConfig.deployer.chainId;
  const deployerEndpointAddress = deployerConfig.deployer.endpointAddress;
  const tokenResourceId = deployerConfig.token.resourceId;

  const receiverRpcUrl = receiverConfig.receiver.rpcUrl; 
  const receiverChainId = receiverConfig.receiver.chainId;
  const receiverPrivateKey = receiverConfig.receiver.privateKey;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const amountToTeleport = ethers.utils.parseEther("800");

  log(`\n--- 💸 Iniciando o Processo de Envio de Token (Cross-Chain) ---`);
  logInfo(`Configurações carregadas.`);
  logInfo(`Resource ID do Token: ${tokenResourceId}`);
  logInfo(`Quantidade a Enviar: ${ethers.utils.formatEther(amountToTeleport)}`);
  logInfo(`Chain ID do Remetente (Deployer): ${deployerChainId}`);
  logInfo(`RPC URL do Remetente (Deployer): ${deployerRpcUrl}`);
  logInfo(`Endereço do Endpoint (Remetente): ${deployerEndpointAddress}`);
  logInfo(`Chain ID do Receiver: ${receiverChainId}`);
  logInfo(`RPC URL do Receiver: ${receiverRpcUrl}`);

  try {
    logStep(`\n1. Configurando Provedores e Wallets...`);

    const { provider, wallet: deployerWallet } = await setupWalletAndProvider(
      deployerRpcUrl,
      deployerChainId,
      deployerPrivateKey,
      "Deployer"
    );

    const { wallet: receiverWallet } = await setupWalletAndProvider(
        receiverRpcUrl,
        receiverChainId,
        receiverPrivateKey,
        "Receiver"
      );
    const receiverAddress = receiverWallet.address;

    logInfo(`  Endereço do Receiver: ${receiverAddress}`);

    logStep(`\n2. Obtendo o endereço do contrato do token pelo Resource ID...`);
    const EndpointContract = await getContractInstance(
        deployerEndpointAddress,
        EndpointContractArtifact.abi,
        deployerWallet,
        provider,
        deployerChainId,
        "Endpoint"
    );

    const deployedTokenAddress = await EndpointContract.getAddressByResourceId(
      tokenResourceId
    );
    logInfo(
      `  Endereço retornado pelo Endpoint para o Resource ID '${tokenResourceId}': ${deployedTokenAddress}`
    );

    if (
      !ethers.utils.isAddress(deployedTokenAddress) ||
      deployedTokenAddress === ZERO_ADDRESS
    ) {
      throw new Error(
        `Token com Resource ID '${tokenResourceId}' não encontrado ou endereço inválido (${deployedTokenAddress}) no Endpoint. Verifique o registro.`
      );
    }

    logStep(`\n3. Instanciando o contrato do token EnygmaToken...`);
    const enygmaTokenContract = await getContractInstance(
      deployedTokenAddress,
      EnygmaTokenArtifact.abi,
      deployerWallet,
      provider,
      deployerChainId,
      "EnygmaTokenExample"
    );

    logStep(`\n4. Verificando saldo do remetente (Deployer)...`);
    const senderBalance = await enygmaTokenContract.balanceOf(deployerWallet.address);
    const tokenSymbol = await enygmaTokenContract.symbol();
    logInfo(
      `  Saldo atual do Remetente (${deployerWallet.address}): ${ethers.utils.formatEther(senderBalance)} ${tokenSymbol}`
    );

    if (senderBalance.lt(amountToTeleport)) {
      throw new Error(
        `Saldo insuficiente para enviar. Saldo atual: ${ethers.utils.formatEther(senderBalance)} ${tokenSymbol}, Necessário: ${ethers.utils.formatEther(amountToTeleport)} ${tokenSymbol}`
      );
    }

    logStep(`\n5. Teleportando ${ethers.utils.formatEther(amountToTeleport)} ${tokenSymbol} para ${receiverAddress} na Chain ID ${receiverChainId}...`);
    logInfo(`  Endereço do Receiver: ${receiverAddress}`);
    logInfo(`  Chain ID do Receiver: ${receiverChainId}`);

    const teleportTx = await enygmaTokenContract.crossTransfer(
      [receiverAddress],
      [amountToTeleport],
      [receiverChainId],
      [[]]
    );
    await waitForTx(
      teleportTx,
      1,
      `Teleport de ${ethers.utils.formatEther(
        amountToTeleport
      )} tokens para ${receiverAddress} na Chain ID ${receiverChainId}`
    );

    logSuccess(`Tokens enviados via crossTransfer com sucesso!`);

    logStep(`\n6. Verificando saldo do remetente após a transferência...`);
    const senderBalanceAfter = await enygmaTokenContract.balanceOf(
      deployerWallet.address
    );
    logInfo(
      `  Saldo do Remetente (Deployer) após a transferência: ${ethers.utils.formatEther(senderBalanceAfter)} ${tokenSymbol}`
    );
    logInfo(`  Para verificar o saldo do receiver, você precisará consultar a rede de destino.`);


    log(`\n--- ✅ Envio de Token Concluído com Sucesso! ---`);
  } catch (error) {
    logError(`\nFalha durante a operação de Envio de Token:`);
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
        logInfo(`  RPC URL do Remetente: ${deployerRpcUrl}`);
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