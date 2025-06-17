import { ethers, Contract, JsonRpcProvider, Wallet, ContractFactory } from "ethers";

export const log = (message: string) => console.log(message);
export const logSuccess = (message: string) => log(`✅ ${message}`);
export const logInfo = (message: string) => log(`ℹ️ ${message}`);
export const logStep = (message: string) => log(`➡️ ${message}`);
export const logError = (message: string) => console.error(`❌ ERRO: ${message}`);
export const logWarning = (message: string) => console.warn(`⚠️ ALERTA: ${message}`);

export async function setupWalletAndProvider(
  rpcUrl: string,
  chainId: number,
  privateKey: string,
  accountName: string
) {
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const wallet = new Wallet(privateKey, provider);
  logInfo(`  Conta ${accountName}: ${wallet.address}`);
  return { provider, wallet };
}

export async function getContractInstance(
  address: string,
  abi: any,
  wallet: Wallet,
  provider: JsonRpcProvider,
  chainId: number,
  contractName: string
) {
  if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
    throw new Error(`Endereço de ${contractName} é inválido ou ZeroAddress: '${address}'.`);
  }

  const contract = new Contract(address, abi, wallet) as any;
  logInfo(`  Contrato ${contractName} instanciado em: ${address}`);

  const code = await provider.getCode(address);
  if (code === '0x') {
    logError(`  ❌ Não há código de contrato no endereço de ${contractName}: ${address}.`);
    throw new Error(`${contractName} não deployado ou endereço incorreto na rede ${chainId}.`);
  } else {
    logInfo(`  Código de contrato encontrado no endereço de ${contractName}. ✅`);
  }
  return contract;
}

export async function deployContract(
  artifact: any,
  deployerWallet: Wallet,
  constructorArgs: any[],
  contractName: string
) {
  logStep(`\nRealizando o Deploy do ${contractName}...`);
  const factory = new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    deployerWallet
  ) as any;

  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  logSuccess(`${contractName} deployado com sucesso em: ${address}`);
  return contract;
}

export async function waitForTx(tx: any, confirmations: number, actionName: string) {
  logInfo(`  Aguardando ${confirmations} confirmações para '${actionName}'...`);
  const receipt = await tx.wait(confirmations);
  if (receipt?.status === 1) {
    logSuccess(`  '${actionName}' concluída! Hash da Tx: ${receipt.hash}`);
  } else {
    logError(`  '${actionName}' falhou! Hash da Tx: ${receipt.hash}`);
    throw new Error(`Transação de '${actionName}' revertida.`);
  }
  return receipt;
}