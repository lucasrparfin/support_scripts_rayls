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

task("mintEnygma", "Mint Enygma Token into a wallet")
  .setAction(async (taskArgs, { ethers, network }) => {
    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const chainId = deployerConfig.deployer.chainId;
    const endpointAddress = deployerConfig.deployer.endpointAddress;
    const resourceId = deployerConfig.token.resourceId as string;
    const amountToMint = 1000;

    let deployerWallet: Wallet;
    let signer: Wallet;

    console.log(`\n--- 🚀 Starting Token Minting Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Resource ID: ${resourceId}`);
    console.log(`Main Chain ID: ${chainId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const deployerProvider = new JsonRpcProvider(rpcUrl);
      deployerWallet = new ethers.Wallet(deployerPrivateKey, deployerProvider);
      signer = deployerWallet.connect(deployerProvider);
      console.log(`  Deployer Wallet (Main): ${deployerWallet.address}`);

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
      console.log(`  - Deployer Address: ${deployerWallet.address}`);

      console.log(`\n4. Checking balance before minting...`);
      const decimals = await enygmaTokenContract.decimals();
      const initialBalance = await enygmaTokenContract.balanceOf(deployerWallet.address);
      console.log(`  Initial balance of ${deployerWallet.address}: ${ethers.utils.formatUnits(initialBalance, decimals)} ${deployedSymbol}`);

      console.log(`\n5. Minting ${amountToMint} tokens to ${deployerWallet.address}...`);

      const mintAmountWei = ethers.utils.parseUnits(amountToMint.toString(), decimals);

      const tx = await enygmaTokenContract.mint(deployerWallet.address, mintAmountWei);
      console.log(`  Mint transaction sent. Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`  Mint transaction confirmed.`);

      console.log(`\n6. Checking balance after minting...`);
      const finalBalance = await enygmaTokenContract.balanceOf(deployerWallet.address);
      console.log(`  Final balance of ${deployerWallet.address}: ${ethers.utils.formatUnits(finalBalance, decimals)} ${deployedSymbol}`);

      if (finalBalance.gt(initialBalance)) {
        console.log(`✅ Mint successful! Balance increased by ${ethers.utils.formatUnits(finalBalance.sub(initialBalance), decimals)} ${deployedSymbol}.`);
      } else {
        console.warn(`⚠ Mint operation might not have increased balance as expected. Initial: ${ethers.utils.formatUnits(initialBalance, decimals)}, Final: ${ethers.utils.formatUnits(finalBalance, decimals)}.`);
      }

      console.log(`\n--- ✨ Token Minting Process Finished Successfully! ---`);

    } catch (error: any) {
      console.error(`\n❌ Token Minting Operation Failed:`);
      console.error(`Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION") {
        console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
      } else if (error.code === "NETWORK_ERROR") {
        console.error(`Network Error: Check your RPC URL or connection.`);
        console.info(`  Main RPC URL: ${rpcUrl}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(`Unsupported operation by RPC provider. Check compatibility.`);
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        // Avoid referencing deployerWallet if it may not be assigned
        console.error(`Insufficient funds for the transaction. Check account balance.`);
      } else {
        console.error(`Unknown Error: ${JSON.stringify(error)}`);
      }
      process.exit(1);
    }
  });