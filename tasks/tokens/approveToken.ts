import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadCcConfig, loadDeployerConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";
import { TX_GAS_OPTIONS, VIEW_CALL_GAS_OPTIONS } from "../../lib/constants";

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const TokenRegistryV1Artifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

task("approveToken", "Approve a token using the resourceId").setAction(
  async (taskArgs, { ethers }) => {
    const ccConfig = loadCcConfig();
    const deployerConfig = loadDeployerConfig();

    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    const resourceId = deployerConfig.token.resourceId as string;

    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Token Approval Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Deployment Registry Address: ${deploymentRegistryAddress}`);
    console.log(`Resource ID to approve: ${resourceId}`);

    try {
      const walletAndSigner = await getWalletAndSigner(privateKey, rpcUrl, "Operator");
      signer = walletAndSigner.signer;
      console.log(`Operator Wallet: ${signer.address}`);

      const DeploymentProxyRegistryContract = (await getContract(
        DeploymentProxyRegistryArtifact.abi,
        deploymentRegistryAddress,
        signer,
        "DeploymentProxyRegistry"
      )) as any;

      const deploymentResult =
        await DeploymentProxyRegistryContract.getDeployment();

      const TokenRegistryV1Address =
        deploymentResult.tokenRegistryAddress;

      console.log(`Token Registry Address: ${TokenRegistryV1Address}`);

      const TokenRegistryV1Contract = (await getContract(
        TokenRegistryV1Artifact.abi,
        TokenRegistryV1Address,
        signer,
        "TokenRegistryV1"
      )) as any;

      console.log(`Fetching all tokens to check status...`);
      const tokens = await TokenRegistryV1Contract.getAllTokens(VIEW_CALL_GAS_OPTIONS);

      const foundToken = tokens.find(
        (token: any) => token.resourceId.toLowerCase() === resourceId.toLowerCase()
      );

      if (!foundToken) {
        console.log(`❌ Token with resource ID ${resourceId} not found in the registry.`);
        return;
      }

      if (Number(foundToken.status) === 1) {
        console.log(`✅ Token with resource ID ${resourceId} is already approved.`);
        return;
      }

      console.log(`Current status of token ${resourceId}: ${foundToken.status}`);
      console.log(`Approving token ${resourceId} ...`);
      
      const tx = await TokenRegistryV1Contract.updateStatus(resourceId, 1, TX_GAS_OPTIONS);
      await tx.wait();

      console.log(`\n✅ Token with resource ID ${resourceId} approved! Transaction Hash: ${tx.hash}`);

    } catch (error: any) {
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: signer ? signer.address : undefined });
      process.exit(1);
    }
  }
);