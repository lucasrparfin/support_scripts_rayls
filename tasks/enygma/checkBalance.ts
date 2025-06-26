import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

const deployerConfig = require(path.join(__dirname, "../../config.deployer.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

task("checkBalance", "Check Enygma Token balance of a wallet")
  .addOptionalParam("walletAddress", "The address of the wallet to check balance for. Defaults to deployer wallet.")
  .setAction(async (taskArgs, { ethers, network }) => {
    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const endpointAddress = deployerConfig.deployer.endpointAddress;
    const resourceId = deployerConfig.token.resourceId as string;
    
    let targetWalletAddress: string;

    let deployerWallet: Wallet;
    let signer: Wallet;

    console.log(`\n--- 🚀 Starting Token Balance Check Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Resource ID: ${resourceId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const deployerProvider = new JsonRpcProvider(rpcUrl);
      deployerWallet = new ethers.Wallet(deployerPrivateKey, deployerProvider);
      signer = deployerWallet.connect(deployerProvider);
      console.log(`  Deployer Wallet (Main): ${deployerWallet.address}`);

      if (taskArgs.walletAddress) {
        targetWalletAddress = taskArgs.walletAddress;
        console.log(`  Checking balance for provided address: ${targetWalletAddress}`);
      } else {
        targetWalletAddress = deployerWallet.address;
        console.log(`  Checking balance for Deployer Wallet (default): ${targetWalletAddress}`);
      }

      const EndpointContract = (await ethers.getContractAt(
        EndpointContractArtifact.abi,
        endpointAddress,
        deployerWallet
      )) as any;

      console.log(`\n2. Retrieving Token Address for Resource ID ${resourceId}...`);
      const enygmaTokenAddress = await EndpointContract.resourceIdToContractAddress(resourceId);

      const enygmaTokenContract = new ethers.Contract(
        enygmaTokenAddress,
        EnygmaTokenArtifact.abi,
        deployerWallet
      );

      console.log(`✅ Token contract found at address: ${enygmaTokenAddress}`);

      console.log(`\n3. Verifying deployed contract properties...`);
      const deployedName = await enygmaTokenContract.name();
      const deployedSymbol = await enygmaTokenContract.symbol();
      console.log(`  - Token Name: ${deployedName}`);
      console.log(`  - Token Symbol: ${deployedSymbol}`);
      
      console.log(`\n4. Fetching balance for ${targetWalletAddress}...`);
      const decimals = await enygmaTokenContract.decimals();
      const currentBalance = await enygmaTokenContract.balanceOf(targetWalletAddress);
      console.log(`  Balance of ${targetWalletAddress}: ${ethers.utils.formatUnits(currentBalance, decimals)} ${deployedSymbol}`);

      console.log(`\n--- ✨ Token Balance Check Finished Successfully! ---`);

    } catch (error: any) {
      console.error(`\n❌ Token Balance Check Operation Failed:`);
      console.error(`Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION") {
        console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
      } else if (error.code === "NETWORK_ERROR") {
        console.error(`Network Error: Check your RPC URL or connection.`);
        console.info(`  Main RPC URL: ${rpcUrl}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(`Unsupported operation by RPC provider. Check compatibility.`);
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        console.error(`Insufficient funds for the transaction. Check account balance.`);
      } else {
        console.error(`Unknown Error: ${JSON.stringify(error)}`);
      }
      process.exit(1);
    }
  });