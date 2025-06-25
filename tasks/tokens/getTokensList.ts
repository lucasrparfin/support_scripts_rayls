import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const ccConfig = require(path.join(__dirname, "../../config.cc.json"));

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const TokenRegistryV1Artifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

const VIEW_CALL_GAS_OPTIONS = {
  gasLimit: 30000000,
};

task("getTokensList", "Get all Tokens on the VEN").setAction(
  async (taskArgs, { ethers }) => {
    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    const provider = new JsonRpcProvider(rpcUrl);
    const venOperatorWallet = new ethers.Wallet(privateKey);
    const signer = venOperatorWallet.connect(provider);

    console.log(`\n--- 🚀 Starting Token List Retrieval Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Deployment Registry Address: ${deploymentRegistryAddress}`);
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

      console.log(`Fetching all tokens...`);
      let tokens = await TokenRegistryV1Contract.getAllTokens(VIEW_CALL_GAS_OPTIONS);

      const statusEnum = ["NEW", "ACTIVE", "INACTIVE"];

      const tableData = tokens.map((token: any) => {
        const statusIndex = Number(token.status);
        const statusName = statusEnum[statusIndex] ?? "UNKNOWN";

        return {
          "Resource ID": token.resourceId.toString(),
          "Name": token.name,
          "Symbol": token.symbol,
          "Status": statusName,
          "Issuer Chain ID": token.issuerChainId.toString(),
          "Created At": new Date(
            Number(token.createdAt) * 1000
          ).toLocaleString(),
          "Updated At": new Date(
            Number(token.updatedAt) * 1000
          ).toLocaleString()
        };
      });

      if (tableData.length > 0) {
        console.table(tableData);
      } else {
        console.log("No tokens registered.");
      }

      console.log(`\nTotal tokens: ${tableData.length}`);

    } catch (error: any) {
      console.error(`\n❌ Token List Retrieval Operation Failed:`);
      console.error(`Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION") {
        console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
      } else if (error.code === "SERVER_ERROR" && error.error && error.error.message) {
        console.error(`RPC Server Error: ${error.error.message}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(`Unsupported operation by RPC provider.`);
      } else {
        console.error(`Unknown Error: ${JSON.stringify(error)}`);
      }
      process.exit(1);
    }
  }
);