import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadDeployerConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";

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
    const deployerConfig = loadDeployerConfig();

    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const endpointAddress = deployerConfig.deployer.endpointAddress;
    const resourceId = deployerConfig.token.resourceId as string;
    
    let targetWalletAddress: string;

    let deployerWallet: Wallet | undefined;
    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Token Balance Check Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Resource ID: ${resourceId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const walletAndSigner = await getWalletAndSigner(deployerPrivateKey, rpcUrl, "Deployer");
      deployerWallet = walletAndSigner.wallet;
      signer = walletAndSigner.signer;
      console.log(`  Deployer Wallet (Main): ${deployerWallet.address}`);

      if (taskArgs.walletAddress) {
        targetWalletAddress = taskArgs.walletAddress;
        console.log(`  Checking balance for provided address: ${targetWalletAddress}`);
      } else {
        targetWalletAddress = deployerWallet.address;
        console.log(`  Checking balance for Deployer Wallet (default): ${targetWalletAddress}`);
      }

      const EndpointContract = (await getContract(
        EndpointContractArtifact.abi,
        endpointAddress,
        signer,
        "Endpoint"
      )) as any;

      console.log(`\n2. Retrieving Token Address for Resource ID ${resourceId}...`);
      const enygmaTokenAddress = await EndpointContract.resourceIdToContractAddress(resourceId);

      const enygmaTokenContract = (await getContract(
        EnygmaTokenArtifact.abi,
        enygmaTokenAddress,
        signer,
        "EnygmaToken"
      )) as any;

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
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: deployerWallet ? deployerWallet.address : undefined });
      process.exit(1);
    }
  });