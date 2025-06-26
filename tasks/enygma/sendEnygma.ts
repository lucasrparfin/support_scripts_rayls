import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

const deployerConfig = require(path.join(__dirname, "../../config.deployer.json"));
const receiverConfig = require(path.join(__dirname, "../../config.receiver.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

const TX_GAS_OPTIONS = {
  gasPrice: 0,
  gasLimit: 30000000,
};

task("sendEnygma", "Sends Enygma Token across chains via crossTransfer")
  .addOptionalParam("amount", "The amount of tokens to teleport. Defaults to 800.")
  .addOptionalParam("receiverAddress", "The address of the receiver. Defaults to receiverConfig.receiver.address.")
  .setAction(async (taskArgs, { ethers, network }) => {

    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const deployerRpcUrl = deployerConfig.deployer.rpcUrl;
    const deployerChainId = deployerConfig.deployer.chainId;
    const deployerEndpointAddress = deployerConfig.deployer.endpointAddress;
    const tokenResourceId = deployerConfig.token.resourceId;

    const receiverRpcUrl = receiverConfig.receiver.rpcUrl;
    const receiverChainId = receiverConfig.receiver.chainId;
    const receiverPrivateKey = receiverConfig.receiver.privateKey;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    let deployerWallet: Wallet | undefined;
    let signer: Wallet | undefined;
    let amountToTeleportRaw: number;
    let receiverAddress: string;

    console.log(`\n--- 💸 Starting Token Cross-Chain Transfer Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Resource ID: ${tokenResourceId}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const deployerProvider = new JsonRpcProvider(deployerRpcUrl);
      deployerWallet = new ethers.Wallet(deployerPrivateKey, deployerProvider);
      signer = deployerWallet.connect(deployerProvider);
      console.log(`  Sender Wallet (Deployer): ${deployerWallet.address}`);
      console.log(`  Sender RPC URL: ${deployerRpcUrl}`);
      console.log(`  Sender Chain ID: ${deployerChainId}`);
      console.log(`  Sender Endpoint Address: ${deployerEndpointAddress}`);

      const receiverProvider = new JsonRpcProvider(receiverRpcUrl);
      const tempReceiverWallet = new ethers.Wallet(receiverPrivateKey, receiverProvider);
      
      if (taskArgs.receiverAddress) {
        receiverAddress = taskArgs.receiverAddress;
      } else {
        receiverAddress = tempReceiverWallet.address;
      }
      console.log(`  Receiver Address: ${receiverAddress}`);
      console.log(`  Receiver Chain ID: ${receiverChainId}`);
      console.log(`  Receiver RPC URL: ${receiverRpcUrl}`);

      if (taskArgs.amount) {
        amountToTeleportRaw = parseFloat(taskArgs.amount);
      } else {
        amountToTeleportRaw = 800;
      }
      console.log(`  Amount to Teleport (Raw): ${amountToTeleportRaw}`);

      console.log(`\n2. Retrieving Token Contract Address from Endpoint...`);
      const EndpointContract = (await ethers.getContractAt(
        EndpointContractArtifact.abi,
        deployerEndpointAddress,
        deployerWallet
      )) as any;

      const deployedTokenAddress = await EndpointContract.resourceIdToContractAddress(tokenResourceId);
      console.log(`  Address returned by Endpoint for Resource ID '${tokenResourceId}': ${deployedTokenAddress}`);

      if (!ethers.utils.isAddress(deployedTokenAddress) || deployedTokenAddress === ZERO_ADDRESS) {
        throw new Error(`Token with Resource ID '${tokenResourceId}' not found or invalid address (${deployedTokenAddress}) on Endpoint. Check registry.`);
      }

      console.log(`\n3. Instantiating EnygmaToken Contract...`);
      const enygmaTokenContract = new ethers.Contract(
        deployedTokenAddress,
        EnygmaTokenArtifact.abi,
        deployerWallet
      );

      console.log(`\n4. Checking Sender's Balance...`);
      const tokenSymbol = await enygmaTokenContract.symbol();
      const decimals = await enygmaTokenContract.decimals();
      const amountToTeleportWei = ethers.utils.parseUnits(amountToTeleportRaw.toString(), decimals);

      const senderBalance = await enygmaTokenContract.balanceOf(deployerWallet.address);
      console.log(`  Current Sender Balance (${deployerWallet.address}): ${ethers.utils.formatUnits(senderBalance, decimals)} ${tokenSymbol}`);
      console.log(`  Amount to Teleport (Wei): ${amountToTeleportWei.toString()}`);

      if (senderBalance.lt(amountToTeleportWei)) {
        throw new Error(`Insufficient balance to send. Current balance: ${ethers.utils.formatUnits(senderBalance, decimals)} ${tokenSymbol}, Required: ${ethers.utils.formatUnits(amountToTeleportWei, decimals)} ${tokenSymbol}`);
      }

      console.log(`\n5. Teleporting ${ethers.utils.formatUnits(amountToTeleportWei, decimals)} ${tokenSymbol} to ${receiverAddress} on Chain ID ${receiverChainId}...`);
      
      const teleportTx = await enygmaTokenContract.crossTransfer(
        [receiverAddress],
        [amountToTeleportWei],
        [receiverChainId],
        [[]],
        TX_GAS_OPTIONS
      );
      console.log(`  Cross-chain transfer transaction sent. Hash: ${teleportTx.hash}`);
      await teleportTx.wait();
      console.log(`  Cross-chain transfer confirmed.`);

      console.log(`\n6. Checking Sender's Balance After Transfer...`);
      const senderBalanceAfter = await enygmaTokenContract.balanceOf(
        deployerWallet.address
      );
      console.log(`  Sender's Balance (Deployer) after transfer: ${ethers.utils.formatUnits(senderBalanceAfter, decimals)} ${tokenSymbol}`);
      console.log(`  To verify receiver's balance, you will need to query the destination network.`);

      console.log(`\n--- ✅ Token Cross-Chain Transfer Completed Successfully! ---`);

    } catch (error: any) {
      console.error(`\n❌ Token Cross-Chain Transfer Operation Failed:`);
      console.error(`Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION") {
        console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
      } else if (error.code === "NETWORK_ERROR") {
        console.error(`Network Error: Check your RPC URL or connection.`);
        console.info(`  Sender RPC URL: ${deployerRpcUrl}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(`Unsupported operation by RPC provider. Check compatibility.`);
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        const walletAddressToDisplay = deployerWallet ? deployerWallet.address : `(Wallet not initialized, check private key or RPC: ${deployerPrivateKey ? deployerPrivateKey.substring(0, 6) + '...' : 'N/A'})`;
        console.error(`Insufficient funds for the transaction. Check account balance: ${walletAddressToDisplay}`);
      } else {
        console.error(`Unknown Error: ${JSON.stringify(error)}`);
      }
      process.exit(1);
    }
  });