import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const ccConfig = require(path.join(__dirname, "../config.cc.json"));

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const TokenRegistryV1Artifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

task("getTokensList", "Get all participants on the VEN").setAction(
  async (taskArgs, { ethers }) => {
    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    const provider = new JsonRpcProvider(rpcUrl);
    const venOperatorWallet = new ethers.Wallet(privateKey);
    const signer = venOperatorWallet.connect(provider);

    const DeploymentProxyRegistryContract = (await ethers.getContractAt(
      DeploymentProxyRegistryArtifact.abi,
      deploymentRegistryAddress,
      signer
    )) as any;

    const deploymentResult =
      await DeploymentProxyRegistryContract.getDeployment();

    const TokenRegistryV1Address =
      deploymentResult.tokenRegistryAddress;

    const TokenRegistryV1Contract = (await ethers.getContractAt(
      TokenRegistryV1Artifact.abi,
      TokenRegistryV1Address,
      signer
    )) as any;

    let tokens = await TokenRegistryV1Contract.getAllTokens();

    const tableData = tokens.map((token: any) => {
    const statusEnum = ["NEW", "ACTIVE", "INACTIVE"];
    const statusIndex = Number(token.status);
    const statusName = statusEnum[statusIndex] ?? "UNKNOWN";

      return {
        "ResourceId": token.resourceId.toString(),
        "Name": token.name,
        "Symbol": token.symbol,
        "Status": statusName,
        "Issuer": token.issuerChainId.toString(),
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
      console.log("No registered.");
    }

    console.log(`\nTotal tokens: ${tableData.length}`);
  }
);
