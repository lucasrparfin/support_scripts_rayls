import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const ccConfig = require(path.join(__dirname, "../../config.cc.json"));
const deployerConfig = require(path.join(__dirname, "../../config.deployer.json"));

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const TokenRegistryV1Artifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

const ZERO_GAS_SETUP = {
  gasPrice: 0,
  gasLimit: 30000000,
};

task("approveToken", "Approve a token using the resourceId").setAction(
  async (taskArgs, { ethers }) => {
    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    const provider = new JsonRpcProvider(rpcUrl);
    const venOperatorWallet = new ethers.Wallet(privateKey);
    const signer = venOperatorWallet.connect(provider);

    const resourceId = deployerConfig.token.resourceId as string;

    console.log(`\n--- 🚀 Starting Token Approval Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Deployment Registry Address: ${deploymentRegistryAddress}`);
    console.log(`Resource ID to approve: ${resourceId}`);
    console.log(`Operator Wallet: ${signer.address}`);

    try {
      const DeploymentProxyRegistryContract = (await ethers.getContractAt(
        DeploymentProxyRegistryArtifact.abi,
        deploymentRegistryAddress,
        signer
      )) as any;

      const deploymentResult =
        await DeploymentProxyRegistryContract.getDeployment();

      const TokenRegistryV1Address =
        deploymentResult.tokenRegistryAddress;

      console.log(`Token Registry Address: ${TokenRegistryV1Address}`);

      const TokenRegistryV1Contract = (await ethers.getContractAt(
        TokenRegistryV1Artifact.abi,
        TokenRegistryV1Address,
        signer
      )) as any;

      console.log(`Fetching all tokens to check status...`);
      const tokens = await TokenRegistryV1Contract.getAllTokens(ZERO_GAS_SETUP);

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
      
      const tx = await TokenRegistryV1Contract.updateStatus(resourceId, 1, ZERO_GAS_SETUP);
      await tx.wait();

      console.log(`\n✅ Token with resource ID ${resourceId} approved! Transaction Hash: ${tx.hash}`);

    } catch (error: any) {
      console.error(`\n❌ Token Approval Operation Failed:`);
      console.error(`Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION") {
        console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
      } else if (error.code === "SERVER_ERROR" && error.error && error.error.message) {
        console.error(`RPC Server Error: ${error.error.message}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(`Unsupported operation by RPC provider.`);
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        console.error(`Insufficient funds for the transaction. Check account balance: ${signer.address}`);
      } else {
        console.error(`Unknown Error: ${JSON.stringify(error)}`);
      }
      process.exit(1);
    }
  }
);