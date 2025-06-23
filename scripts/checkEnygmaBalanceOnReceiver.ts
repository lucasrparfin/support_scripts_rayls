import { ethers } from "ethers";
import * as path from "path";

import {
  log,
  logSuccess,
  logInfo,
  logStep,
  logError,
  logWarning,
  setupWalletAndProvider,
  getContractInstance,
} from "./utils";

const receiverConfig = require(path.join(__dirname, "../config.receiver.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const endpointContractArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

async function main() {
  let expectedAmount = 100;

  const rpcUrl = receiverConfig.receiver.rpcUrl;
  const chainId = receiverConfig.receiver.chainId;
  const receiverPrivateKey = receiverConfig.receiver.privateKey;
  const resourceId = receiverConfig.token.resourceId;
  const endpointAddress = receiverConfig.receiver.endpointAddress;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  log(`\n--- 🔍 Verificando saldo do receiver ---`);
  logInfo(`URL RPC: ${rpcUrl}`);
  logInfo(`Chain ID: ${chainId}`);
  logInfo(`Endereço do Endpoint: ${endpointAddress}`);

  try {
    const { provider, wallet: receiverWallet } = await setupWalletAndProvider(
      rpcUrl,
      chainId,
      receiverPrivateKey,
      "Receiver"
    );

    const endpointContract = await getContractInstance(
      endpointAddress,
      endpointContractArtifact.abi,
      receiverWallet,
      provider,
      chainId,
      "Endpoint"
    );

    logStep(`\n3. Obtendo o endereço do token pelo Resource ID...`);
    const deployedEnygmaAddress = await endpointContract.getAddressByResourceId(
      resourceId
    );
    logInfo(
      `  Endereço retornado pelo Endpoint para o Resource ID '${resourceId}': ${deployedEnygmaAddress}`
    );

    if (
      !ethers.utils.isAddress(deployedEnygmaAddress) ||
      deployedEnygmaAddress === ZERO_ADDRESS
    ) {
      throw new Error(
        `Token com Resource ID '${resourceId}' não encontrado ou endereço inválido (${deployedEnygmaAddress}) no Endpoint. Verifique o registro.`
      );
    }

    const enygmaTokenContract = await getContractInstance(
      deployedEnygmaAddress,
      EnygmaTokenArtifact.abi,
      receiverWallet,
      provider,
      chainId,
      "EnygmaTokenExample"
    );

    logStep(`\n5. Checando o saldo do token para o receiver...`);
    let tokenSymbol = "TKN";
    try {
      tokenSymbol = await enygmaTokenContract.symbol();
    } catch (symbolError: any) {
      logWarning(
        `Não foi possível obter o símbolo do token: ${symbolError.message}`
      );
    }
    const balance = await enygmaTokenContract.balanceOf(receiverWallet.address);

    const formattedBalance = ethers.utils.formatEther(balance);
    logSuccess(
      `  Saldo do receiver (${receiverWallet.address}): ${formattedBalance} ${tokenSymbol}`
    );

    if (expectedAmount !== undefined) {
      const expectedAmountBigNumber = ethers.utils.parseEther(expectedAmount.toString());

      logInfo(`  Saldo atual (BigNumber): ${balance.toString()}`);
      logInfo(`  Valor esperado (BigNumber): ${expectedAmountBigNumber.toString()}`);

      if (balance.eq(expectedAmountBigNumber)) {
        logSuccess(
          `  ✅ Saldo atual (${formattedBalance} ${tokenSymbol}) corresponde ao valor esperado (${ethers.utils.formatEther(expectedAmountBigNumber)} ${tokenSymbol}).`
        );
      } else {
        logWarning(
          `  ⚠️ Saldo atual (${formattedBalance} ${tokenSymbol}) NÃO corresponde ao valor esperado (${ethers.utils.formatEther(expectedAmountBigNumber)} ${tokenSymbol}).`
        );
      }
    }

    log(`\n--- ✅ Checagem de saldo concluída! ---`);
  } catch (error) {
    logError(`\nFalha durante a checagem de saldo do receiver:`);
    if (error instanceof Error) {
      logError(`Mensagem: ${error.message}`);
      if ("code" in error && (error as any).code === "CALL_EXCEPTION") {
        logError(
          `Detalhes do revert EVM: ${JSON.stringify(
            (error as any).data || (error as any).reason
          )}`
        );
      } else if ("code" in error && (error as any).code === "NETWORK_ERROR") {
        logError(`Erro de rede: verifique sua URL RPC ou conexão.`);
        logInfo(`  URL RPC usada: ${rpcUrl}`);
      } else if (
        "code" in error &&
        (error as any).code === "UNSUPPORTED_OPERATION"
      ) {
        logError(
          `Operação não suportada pelo provedor RPC. Verifique a compatibilidade do RPC ou tente um provedor diferente.`
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