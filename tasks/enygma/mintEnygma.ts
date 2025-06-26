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

task("mintEnygma", "Mint Enygma Token into a wallet")
  .setAction(async (taskArgs, { ethers, network }) => {
    const deployerConfig = loadDeployerConfig();

    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const chainId = deployerConfig.deployer.chainId;
    const endpointAddress = deployerConfig.deployer.endpointAddress;
    const resourceId = deployerConfig.token.resourceId as string;
    const amountToMint = 1000;

    let deployerSigner: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Token Minting Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Resource ID: ${resourceId}`);
    console.log(`Main Chain ID: ${chainId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const walletAndSigner = await getWalletAndSigner(deployerPrivateKey, rpcUrl, "Deployer");
      deployerSigner = walletAndSigner.signer;
      console.log(`  Deployer Wallet (Main): ${deployerSigner.address}`);

      const EndpointContract = (await getContract(
        EndpointContractArtifact.abi,
        endpointAddress,
        deployerSigner,
        "Endpoint"
      )) as any;

      console.log(`\n2. Retrieving Token Address for Resource ID ${resourceId}...`);
      const enygmaTokenAddress = await EndpointContract.resourceIdToContractAddress(resourceId);

      const enygmaTokenContract = (await getContract(
        EnygmaTokenArtifact.abi,
        enygmaTokenAddress,
        deployerSigner,
        "EnygmaToken"
      )) as any;

      console.log(`✅ Token contract found at address: ${enygmaTokenAddress}`);

      console.log(`\n3. Verifying deployed contract properties...`);
      const deployedName = await enygmaTokenContract.name();
      const deployedSymbol = await enygmaTokenContract.symbol();
      console.log(`  - Token Name: ${deployedName}`);
      console.log(`  - Token Symbol: ${deployedSymbol}`);
      console.log(`  - Deployer Address: ${deployerSigner.address}`);

      console.log(`\n4. Checking balance before minting...`);
      const decimals = await enygmaTokenContract.decimals();
      const initialBalance = await enygmaTokenContract.balanceOf(deployerSigner.address);
      console.log(`  Initial balance of ${deployerSigner.address}: ${ethers.utils.formatUnits(initialBalance, decimals)} ${deployedSymbol}`);

      console.log(`\n5. Minting ${amountToMint} tokens to ${deployerSigner.address}...`);

      const mintAmountWei = ethers.utils.parseUnits(amountToMint.toString(), decimals);

      const tx = await enygmaTokenContract.mint(deployerSigner.address, mintAmountWei);
      console.log(`  Mint transaction sent. Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`  Mint transaction confirmed.`);

      console.log(`\n6. Checking balance after minting...`);
      const finalBalance = await enygmaTokenContract.balanceOf(deployerSigner.address);
      console.log(`  Final balance of ${deployerSigner.address}: ${ethers.utils.formatUnits(finalBalance, decimals)} ${deployedSymbol}`);

      if (finalBalance.gt(initialBalance)) {
        console.log(`✅ Mint successful! Balance increased by ${ethers.utils.formatUnits(finalBalance.sub(initialBalance), decimals)} ${deployedSymbol}.`);
      } else {
        console.warn(`⚠ Mint operation might not have increased balance as expected. Initial: ${ethers.utils.formatUnits(initialBalance, decimals)}, Final: ${ethers.utils.formatUnits(finalBalance, decimals)}.`);
      }

      console.log(`\n--- ✨ Token Minting Process Finished Successfully! ---`);

    } catch (error: any) {
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: deployerSigner ? deployerSigner.address : undefined });
      process.exit(1);
    }
  });