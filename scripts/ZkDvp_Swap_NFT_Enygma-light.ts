import {
  ethers,
  Contract,
  JsonRpcProvider,
  Wallet,
  ContractFactory,
  EventLog,
  Log,
} from "ethers";
import * as path from "path";
import { expect } from "chai";

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

// Artefatos dos contratos
const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const Erc721ZkDvpArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/test-contracts/Erc721ZkDvpExample.sol/Erc721ZkDvpExample.json"
));

const ZkDvPErc721Artifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/ZkDvp/ZkDvpErc721CC.sol/ZkDvpErc721CC.json"
));

const ccProxyRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const tokenRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

const endpointArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

const zkDvpTeleportArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/rayls-protocol/ZkDvp/ZkDvpTeleport.sol/ZkDvpTeleport.json"
));

// Configurações
const ccConfig = require(path.join(__dirname, "../config.cc.json"));
const deployerConfig = require(path.join(__dirname, "../config.deployer.json"));
const receiverConfig = require(path.join(__dirname, "../config.receiver.json"));

// Mock para pollCondition (você precisará da sua implementação real)
async function pollCondition<T>(
  condition: () => Promise<T | false>,
  interval: number,
  timeout: number
): Promise<T | false> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout * 1000) {
    const result = await condition();
    if (result !== false) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

const LogForTest = (message: string) => logInfo(message);

function genRanHex(size: number) {
  return [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");
}

async function assertEnygmaDeposit(
  signerCC: Wallet,
  amount: number,
  signerAddress: string,
  nodeName: string,
  zkDvpAddress: string,
  endpointCC: Contract,
  enygmaTokenResourceId: string,
  providerCC: JsonRpcProvider,
  chainIdCC: number,
  enygmaTokenOnPLA: Contract
) {
  logInfo(`  Confirmando transferência de Enygma para ${signerAddress} na rede ${nodeName}.`);
  
  try {
    const enygmaTokenOnCC = await getContractInstance(
      await endpointCC.getAddressByResourceId(enygmaTokenResourceId),
      EnygmaTokenArtifact.abi,
      signerCC,
      providerCC,
      chainIdCC,
      "EnygmaTokenExample (on CC)"
    );

    const totalSupply = await enygmaTokenOnCC.totalSupply();
    const transferEvents = await enygmaTokenOnPLA.queryFilter(
      enygmaTokenOnPLA.filters.Transfer(),
      -1000,
      'latest'
    );
    
    const relevantTransfers = transferEvents.filter((event: Log | EventLog) => {
      if (!(event instanceof EventLog)) return false;
      const args = event.args;
      return args && (
        (args.from.toLowerCase() === signerAddress.toLowerCase() && args.to.toLowerCase() === ethers.ZeroAddress.toLowerCase()) ||
        (args.to.toLowerCase() === signerAddress.toLowerCase() && args.from.toLowerCase() === ethers.ZeroAddress.toLowerCase())
      );
    });
    
    const hasDepositEvent = relevantTransfers.some((event: Log | EventLog) => {
      if (!(event instanceof EventLog)) return false;
      const args = event.args;
      return args && 
        args.from.toLowerCase() === signerAddress.toLowerCase() && 
        args.to.toLowerCase() === ethers.ZeroAddress.toLowerCase() &&
        args.value === BigInt(amount);
    });
    
    expect(hasDepositEvent).to.be.true;
    logSuccess(`  Transferência confirmada.`);
    
  } catch (error) {
    logError(`  Erro ao verificar depósito: ${error}`);
    if (error instanceof Error) {
      logError(`  Detalhes do erro: ${error.message}`);
    }
    throw error;
  }
}

interface ZkDvpProgramabilityStruct {
  contractAddress: string;
  resourceId: string;
  payload: string;
}


async function validatePermissions(
  contract: Contract,
  signer: Wallet,
  role: string
) {
  const hasRole = await contract.hasRole(role, signer.address);
  expect(hasRole).to.be.true;
}

async function main() {
  const NFT_ID = 1;
  const CHANGE_AMOUNT = 10;
  const PAYMENT_AMOUNT = 100;
  const TOTAL_AMOUNT = PAYMENT_AMOUNT + CHANGE_AMOUNT;
  const NUMBER_OF_DEPOSITS = 1;
  const ENYGMA_DEPOSIT_AMOUNT = TOTAL_AMOUNT / NUMBER_OF_DEPOSITS;

  const rpcUrlA = deployerConfig.deployer.rpcUrl;
  const rpcUrlB = receiverConfig.receiver.rpcUrl;
  const rpcUrlCC = ccConfig.commitChain.rpcUrl;

  const endpointAddressA = deployerConfig.deployer.endpointAddress;
  const endpointAddressB = receiverConfig.receiver.endpointAddress;
  const deploymentProxyRegistryAddress =
    ccConfig.commitChain.ccDeploymentProxyRegistry;
  const operatorPrivateKey = ccConfig.commitChain.privateKey;

  const chainIdA = deployerConfig.deployer.chainId;
  const chainIdB = receiverConfig.receiver.chainId;
  const chainIdCC = ccConfig.commitChain.chainId;

  log(`\n--- 🚀 Iniciando o Processo de Teste E2E ZkDvpSwap ---`);
  logInfo(`Configurações carregadas.`);
  logInfo(`RPC URL Node A: ${rpcUrlA}`);
  logInfo(`RPC URL Node B: ${rpcUrlB}`);
  logInfo(`RPC URL Commit Chain: ${rpcUrlCC}`);

  logStep(`\n1. Configurando Provedores e Wallets...`);
  const { provider: providerA, wallet: signerA } = await setupWalletAndProvider(
    rpcUrlA,
    chainIdA,
    ethers.Wallet.createRandom().privateKey,
    "Signer A"
  );
  const { provider: providerB, wallet: signerB } = await setupWalletAndProvider(
    rpcUrlB,
    chainIdB,
    ethers.Wallet.createRandom().privateKey,
    "Signer B"
  );
  const { provider: providerCC, wallet: signerCC } =
    await setupWalletAndProvider(
      rpcUrlCC,
      chainIdCC,
      operatorPrivateKey,
      "Signer CC (Operator)"
    );

  const randHex = `0x${genRanHex(6)}`;
  const enygmaTokenName = `enygma-${randHex}`;
  const enygmaTokenSymbol = `E_${randHex}`;
  const erc721TokenURI = `random-uri`;
  const erc721TokenName = `erc721-${randHex}`;
  const erc721TokenSymbol = `ERC721_${randHex}`;

  let enygmaTokenResourceId = "";
  let erc721TokenResourceId = "";

  let zkDvpAddress = "";
  let tokenRegistryAddress = "";
  let endpointAddressCC = "";
  let zkDvpTeleportAddress = "";

  let EndpointA: Contract;
  let EndpointB: Contract;
  let EndpointCC: Contract;
  let TokenRegistry: Contract;
  let ZkDvpTeleport: Contract;
  let EnygmaTokenOnPLA: Contract;
  let Erc721TokenOnPLB: Contract;
  let EnygmaTokenOnPLB: Contract | undefined;

  let EnygmaTokenOnCC: Contract | undefined;
  let Erc721TokenOnCC: Contract | undefined;
  let ERC721TokenOnPLA: Contract | undefined;

  const sharedId = ethers.keccak256(ethers.randomBytes(32));

  try {
    logStep(
      `\n2. Obtendo instâncias de contratos pré-existentes e deployando tokens...`
    );

    const ccProxyRegistryContract = await getContractInstance(
      deploymentProxyRegistryAddress,
      ccProxyRegistryArtifact.abi,
      signerCC,
      providerCC,
      chainIdCC,
      "DeploymentProxyRegistry"
    );

    const deployment = await ccProxyRegistryContract.getDeployment();

    tokenRegistryAddress = deployment.tokenRegistryAddress;
    endpointAddressCC = deployment.endpointAddress;
    zkDvpAddress = deployment.zkDvpAddress;
    zkDvpTeleportAddress = deployment.zkDvpTeleportAddress;

    EndpointA = await getContractInstance(
      endpointAddressA,
      endpointArtifact.abi,
      signerA,
      providerA,
      chainIdA,
      "EndpointV1 (PL A)"
    );
    EndpointB = await getContractInstance(
      endpointAddressB,
      endpointArtifact.abi,
      signerB,
      providerB,
      chainIdB,
      "EndpointV1 (PL B)"
    );
    EndpointCC = await getContractInstance(
      endpointAddressCC,
      endpointArtifact.abi,
      signerCC,
      providerCC,
      chainIdCC,
      "EndpointV1 (CC)"
    );
    TokenRegistry = await getContractInstance(
      tokenRegistryAddress,
      tokenRegistryArtifact.abi,
      signerCC,
      providerCC,
      chainIdCC,
      "TokenRegistryV1"
    );
    ZkDvpTeleport = await getContractInstance(
      zkDvpTeleportAddress,
      zkDvpTeleportArtifact.abi,
      signerCC,
      providerCC,
      chainIdCC,
      "ZkDvpTeleport"
    );

    // Deploy do Enygma Token na PL A
    EnygmaTokenOnPLA = await deployContract(
      EnygmaTokenArtifact,
      signerA,
      [enygmaTokenName, enygmaTokenSymbol, endpointAddressA],
      "EnygmaTokenExample"
    );

    // Deploy do ERC721 Token na PL B
    Erc721TokenOnPLB = await deployContract(
      Erc721ZkDvpArtifact,
      signerB,
      [erc721TokenURI, erc721TokenName, erc721TokenSymbol, endpointAddressB],
      "Erc721ZkDvpExample"
    );

    logStep(
      `\n3. Registrando Enygma Token na PL A e ERC721 Token na PL B e Aprovando no Token Registry da CC...`
    );
    LogForTest(
      `Registrando Enygma token na PL A, ERC721 token na PL B e Aprovando no Token Registry na CC`
    );

    let tx = await EnygmaTokenOnPLA.submitTokenRegistration(0);
    await waitForTx(tx, 1, `submitTokenRegistration para Enygma Token`);

    // Adicionar delay entre transações
    await new Promise(resolve => setTimeout(resolve, 2000));

    tx = await Erc721TokenOnPLB.submitTokenRegistration(0);
    await waitForTx(tx, 1, `submitTokenRegistration para ERC721 Token`);

    LogForTest(
      `Aguardando que Enygma token e ERC721 token sejam registrados na CC`
    );
    const registered = await pollCondition(
      async (): Promise<boolean> => {
        const tokensOnCC = await TokenRegistry.getAllTokens();

        const enygmaTokenOnCC = tokensOnCC.find(
          ({ name }: any) => name === enygmaTokenName
        );
        const erc721TokenOnCC = tokensOnCC.find(
          ({ name }: any) => name === erc721TokenName
        );

        if (!enygmaTokenOnCC || !erc721TokenOnCC) return false;

        enygmaTokenResourceId = enygmaTokenOnCC.resourceId;
        erc721TokenResourceId = erc721TokenOnCC.resourceId;

        return true;
      },
      1000,
      300
    );
    if (registered === false) {
      throw new Error(
        "Enygma token ou ERC721 token não registrados na CC dentro do tempo limite."
      );
    }
    expect(registered).to.be.true;
    logSuccess(`Tokens registrados na Commit Chain.`);

    LogForTest(`Aprovando recursos no Token Registry...`);
    
    // Obter o nonce atual e garantir que está atualizado
    let nonce = await signerCC.getNonce();
    logInfo(`  Nonce atual: ${nonce}`);

    // Primeira aprovação
    tx = await TokenRegistry.updateStatus(enygmaTokenResourceId, 1, {
      gasLimit: 5000000,
      nonce: nonce
    });
    await waitForTx(tx, 1, `Aprovação de Enygma Token no Token Registry`);

    // Aguardar um tempo para garantir que a transação foi processada
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Atualizar o nonce antes da próxima transação
    nonce = await signerCC.getNonce();
    logInfo(`  Nonce atualizado: ${nonce}`);

    // Segunda aprovação com nonce atualizado
    tx = await TokenRegistry.updateStatus(erc721TokenResourceId, 1, {
      gasLimit: 5000000,
      nonce: nonce
    });
    await waitForTx(tx, 1, `Aprovação de ERC721 Token no Token Registry`);

    LogForTest(
      `Aguardando que Enygma token e ERC721 token sejam aprovados na CC`
    );

    const approvedContracts = await pollCondition(
      async (): Promise<{ enygma: Contract; erc721: Contract } | false> => {
        if (
          enygmaTokenResourceId ===
            "0x0000000000000000000000000000000000000000000000000000000000000000" ||
          erc721TokenResourceId ===
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        )
          return false;

        const enygmaAddr = await EndpointCC.getAddressByResourceId(
          enygmaTokenResourceId
        );
        const erc721Addr = await EndpointCC.getAddressByResourceId(
          erc721TokenResourceId
        );

        if (
          erc721Addr === ethers.ZeroAddress ||
          enygmaAddr === ethers.ZeroAddress
        )
          return false;

        const enygma = await getContractInstance(
          enygmaAddr,
          EnygmaTokenArtifact.abi,
          signerCC,
          providerCC,
          chainIdCC,
          "EnygmaTokenExample (on CC)"
        );
        const erc721 = await getContractInstance(
          erc721Addr,
          ZkDvPErc721Artifact.abi,
          signerCC,
          providerCC,
          chainIdCC,
          "Erc721ZkDvpExample (on CC)"
        );
        return { enygma, erc721 };
      },
      1000,
      300
    );

    if (approvedContracts === false) {
      throw new Error(
        "Enygma token ou ERC721 token não aprovados na CC dentro do tempo limite."
      );
    }
    expect(approvedContracts).to.be.not.false;
    EnygmaTokenOnCC = approvedContracts.enygma;
    Erc721TokenOnCC = approvedContracts.erc721;

    logSuccess(`Tokens aprovados na Commit Chain.`);

    logStep(`\n4. Mintando ${TOTAL_AMOUNT} Enygmas e 1x ERC721 NFT...`);
    LogForTest(`Minting ${TOTAL_AMOUNT} Enygmas e ERC721 NFT`);

    const enygmaBalanceBeforeMint = await EnygmaTokenOnCC!.totalSupply();
    const nftBalanceBefore = await Erc721TokenOnCC!.getTotalSupply();

    LogForTest(`Minting Enygmas`);
    tx = await EnygmaTokenOnPLA.mint(signerA.address, TOTAL_AMOUNT);
    await waitForTx(tx, 1, `Mint de ${TOTAL_AMOUNT} Enygmas`);

    LogForTest(`Minting NFT`);
    tx = await Erc721TokenOnPLB.mint(signerB.address, NFT_ID, []);
    await waitForTx(tx, 1, `Mint de NFT com ID ${NFT_ID}`);

    LogForTest(
      `Aguardando que Enygma token e ERC721 token sejam mintados na CC`
    );
    const minted = await pollCondition(
      async (): Promise<boolean> => {
        const currentEnygmaSupply = await EnygmaTokenOnCC!.totalSupply();
        const currentNftSupply = await Erc721TokenOnCC!.getTotalSupply();

        return (
          currentEnygmaSupply ===
            enygmaBalanceBeforeMint + BigInt(TOTAL_AMOUNT) &&
          currentNftSupply.length === nftBalanceBefore.length + 1
        );
      },
      1000,
      300
    );
    if (minted === false) {
      throw new Error(
        "Enygma token ou ERC721 token não mintados na CC dentro do tempo limite."
      );
    }
    expect(minted).to.be.true;
    logSuccess(`Tokens mintados com sucesso.`);

    logStep(
      `\n5. Depositando ${NUMBER_OF_DEPOSITS}x ${ENYGMA_DEPOSIT_AMOUNT} Enygmas e 1x ERC721 NFT...`
    );
    LogForTest(
      `Depositing ${NUMBER_OF_DEPOSITS}x ${ENYGMA_DEPOSIT_AMOUNT} Enygmas and 1x ERC721 NFT`
    );

    LogForTest(`Depositing #1 ${ENYGMA_DEPOSIT_AMOUNT} Enygmas`);
    tx = await EnygmaTokenOnPLA.depositToZkDvp(ENYGMA_DEPOSIT_AMOUNT);
    await waitForTx(tx, 1, `Depósito de ${ENYGMA_DEPOSIT_AMOUNT} Enygmas`);

    await assertEnygmaDeposit(
      signerCC,
      ENYGMA_DEPOSIT_AMOUNT,
      signerA.address,
      "A",
      zkDvpAddress,
      EndpointCC,
      enygmaTokenResourceId,
      providerCC,
      chainIdCC,
      EnygmaTokenOnPLA
    );

    LogForTest(`Depositing ERC721 NFT`);
    tx = await Erc721TokenOnPLB.depositIntoZkdvp(NFT_ID);
    await waitForTx(tx, 1, `Depósito de NFT com ID ${NFT_ID}`);

    LogForTest(`Checking whether the NFT is now owned by ZkDvp`);

    const nftOwnedByZkDvp = await pollCondition(
      async (): Promise<boolean> => {
        const owner = await Erc721TokenOnCC!.ownerOf(NFT_ID);
        return owner === zkDvpAddress;
      },
      1000,
      300
    );
    if (nftOwnedByZkDvp === false) {
      throw new Error(
        "ERC721 token não depositado no ZkDvp dentro do tempo limite."
      );
    }
    expect(nftOwnedByZkDvp).to.be.true;
    logSuccess(`Depósitos concluídos.`);

    logStep(
      `\n6. Realizando Swap de NFT por ${PAYMENT_AMOUNT} Enygmas - Sem calldata...`
    );
    LogForTest(`Swapping NFT for ${PAYMENT_AMOUNT} Enygmas`);

    const msg: ZkDvpProgramabilityStruct = {
      contractAddress: ethers.ZeroAddress,
      resourceId: ethers.ZeroHash,
      payload: "0x",
    };

    const fromBlockNumber = await providerCC.getBlockNumber();

    LogForTest(`Triggering swap from NFT side`);
    tx = await Erc721TokenOnPLB.swapWithZkDvpForEnygma(
      NFT_ID,
      PAYMENT_AMOUNT,
      enygmaTokenResourceId,
      chainIdA,
      sharedId,
      msg
    );
    await waitForTx(tx, 1, `Swap de NFT (lado B)`);

    LogForTest(`Triggering swap from Enygma side`);
    tx = await EnygmaTokenOnPLA.swapWithZkDvpForERC721(
      NFT_ID,
      erc721TokenResourceId,
      PAYMENT_AMOUNT,
      chainIdB,
      sharedId,
      msg
    );
    await waitForTx(tx, 1, `Swap de Enygma (lado A)`);

    LogForTest(`Waiting for calldata to be executed`);
    const calldataExecuted = await pollCondition(
      async (): Promise<boolean> => {
        const executions = await ZkDvpTeleport.calldataExecutions(sharedId);
        return executions === BigInt(2);
      },
      1000,
      300
    );
    if (calldataExecuted === false) {
      throw new Error(
        "Calldata não executado em ambos os lados dentro do tempo limite."
      );
    }
    expect(calldataExecuted).to.be.true;
    logSuccess(`Calldata executado.`);

    LogForTest(`Waiting for swap to be completed`);
    const swapStateChangedFilter =
      ZkDvpTeleport.filters.SwapStateChanged(sharedId);

    const swapCompleted = await pollCondition(
      async (): Promise<boolean> => {
        const swapEvents = await ZkDvpTeleport.queryFilter(
          swapStateChangedFilter,
          fromBlockNumber,
          'latest'
        );

        const stateChangedLog =
          swapEvents.length > 0 && swapEvents[0] instanceof EventLog
            ? (swapEvents[0] as EventLog)
            : undefined;

        return !!(stateChangedLog && stateChangedLog.args.state === BigInt(0));
      },
      1000,
      300
    );
    if (swapCompleted === false) {
      throw new Error("Swap não concluído dentro do tempo limite.");
    }
    expect(swapCompleted).to.be.true;
    logSuccess(`Swap concluído com sucesso.`);

    logStep(`\n7. PL A Withdraws ERC721 NFT...`);
    LogForTest(`PL A withdrawing NFT`);

    const erc721DeployedOnPLA = await pollCondition(
      async (): Promise<Contract | false> => {
        const erc721AddrOnPLA = await EndpointA.getAddressByResourceId(
          erc721TokenResourceId
        );

        if (erc721AddrOnPLA === ethers.ZeroAddress) return false;

        const contractInstance = await getContractInstance(
          erc721AddrOnPLA,
          Erc721ZkDvpArtifact.abi,
          signerA,
          providerA,
          chainIdA,
          "Erc721ZkDvpExample"
        );

        return contractInstance;
      },
      1000,
      300
    );
    if (erc721DeployedOnPLA === false) {
      throw new Error(
        "ERC721 token não deployado na PL A dentro do tempo limite."
      );
    }
    expect(erc721DeployedOnPLA).to.be.not.false;
    ERC721TokenOnPLA = erc721DeployedOnPLA;

    logSuccess(`ERC721 token deployado na PL A.`);

    LogForTest(`Withdrawing NFT`);
    tx = await ERC721TokenOnPLA!.withdrawFromZkDvp(NFT_ID);
    await waitForTx(tx, 1, `Retirada de NFT por PL A`);

    LogForTest(`Waiting for NFT to be withdrawn`);
    const nftWithdrawn = await pollCondition(
      async (): Promise<boolean> => {
        return (await ERC721TokenOnPLA!.ownerOf(NFT_ID)) === signerA.address;
      },
      1000,
      300
    );
    if (nftWithdrawn === false) {
      throw new Error("NFT não retirado na PL A dentro do tempo limite.");
    }
    expect(nftWithdrawn).to.be.true;
    logSuccess(`NFT retirado com sucesso por PL A.`);

    logStep(`\n8. PL B Withdraws ${PAYMENT_AMOUNT} Enygmas...`);
    LogForTest(`PL B withdrawing Enygmas`);

    const enygmaDeployedOnPLBResult = await pollCondition(
      async (): Promise<Contract | false> => {
        const enygmaAddrOnPLB = await EndpointB.getAddressByResourceId(
          enygmaTokenResourceId
        );

        if (enygmaAddrOnPLB === ethers.ZeroAddress) return false;

        const contractInstance = await getContractInstance(
          enygmaAddrOnPLB,
          EnygmaTokenArtifact.abi,
          signerB,
          providerB,
          chainIdB,
          "EnygmaTokenExample"
        );

        return contractInstance;
      },
      1000,
      300
    );
    if (enygmaDeployedOnPLBResult === false) {
      throw new Error(
        "Enygma token não deployado na PL B dentro do tempo limite."
      );
    }
    expect(enygmaDeployedOnPLBResult).to.be.not.false;

    // ATENÇÃO AQUI: Atribuição de EnygmaTokenOnPLB após ser obtido
    EnygmaTokenOnPLB = enygmaDeployedOnPLBResult;

    logSuccess(`Enygma token deployado na PL B.`);

    LogForTest(`Withdrawing ${PAYMENT_AMOUNT} Enygmas`);
    tx = await EnygmaTokenOnPLB!.callWithdrawFromZkDvp(PAYMENT_AMOUNT);
    await waitForTx(tx, 1, `Retirada de ${PAYMENT_AMOUNT} Enygmas por PL B`);

    LogForTest(`Waiting for Enygmas to be withdrawn`);

    const enygmasWithdrawn = await pollCondition(
      async (): Promise<boolean> => {
        const balance = await EnygmaTokenOnPLB!.balanceOf(signerB.address);
        return balance === BigInt(PAYMENT_AMOUNT);
      },
      1000,
      300
    );
    if (enygmasWithdrawn === false) {
      throw new Error("Enygmas não retirados na PL B dentro do tempo limite.");
    }
    expect(enygmasWithdrawn).to.be.true;
    logSuccess(`Enygmas retirados com sucesso por PL B.`);

    logStep(`\n9. Enygma crossTransfer from PL B to A`);
    LogForTest(`Cross transferring Enygmas from PL B to A`);

    const enygmaBalanceBeforeCrossTransfer = await EnygmaTokenOnPLA.balanceOf(
      signerA.address
    );

    LogForTest(`Cross transferring ${PAYMENT_AMOUNT} Enygmas from PL B to A`);
    tx = await EnygmaTokenOnPLB!.crossTransfer(
      // Usando o EnygmaTokenOnPLB que acabamos de atribuir
      [signerA.address],
      [PAYMENT_AMOUNT],
      [chainIdA],
      [[]]
    );
    await waitForTx(tx, 1, `Cross transfer de Enygmas`);

    LogForTest(`Waiting for cross transfer to be completed`);
    const crossTransferCompleted = await pollCondition(
      async (): Promise<boolean> => {
        const balance = await EnygmaTokenOnPLA.balanceOf(signerA.address);
        return (
          balance === enygmaBalanceBeforeCrossTransfer + BigInt(PAYMENT_AMOUNT)
        );
      },
      1000,
      300
    );
    if (crossTransferCompleted === false) {
      throw new Error(
        "Enygmas não cross transferred para PL A dentro do tempo limite."
      );
    }
    expect(crossTransferCompleted).to.be.true;
    logSuccess(`Cross transfer concluído com sucesso.`);

    log(`\n--- ✨ Teste E2E ZkDvpSwap Finalizado com Sucesso! ---`);
  } catch (error) {
    logError(`\nFalha durante a operação de Teste E2E ZkDvpSwap:`);
    if (error instanceof Error) {
      logError(`Mensagem: ${error.message}`);
      if ("code" in error && (error as any).code === "CALL_EXCEPTION") {
        logError(
          `Detalhes de Revert EVM: ${JSON.stringify(
            (error as any).data || (error as any).reason
          )}`
        );
      } else if ("code" in error && (error as any).code === "NETWORK_ERROR") {
        logError(`Erro de Rede: Verifique suas RPC URLs ou conexão.`);
        logInfo(`  RPC URL principal (A): ${rpcUrlA}`);
        logInfo(`  RPC URL principal (B): ${rpcUrlB}`);
        logInfo(`  RPC URL Commit Chain: ${rpcUrlCC}`);
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
