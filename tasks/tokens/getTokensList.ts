import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadCcConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";
import { VIEW_CALL_GAS_OPTIONS } from "../../lib/constants";

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const TokenRegistryV1Artifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

task("getTokensList", "Get all Tokens on the VEN").setAction(
  async (taskArgs, { ethers }) => {
    const ccConfig = loadCcConfig();

    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Token List Retrieval Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Deployment Registry Address: ${deploymentRegistryAddress}`);

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
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: signer ? signer.address : undefined });
      process.exit(1);
    }
  }
);