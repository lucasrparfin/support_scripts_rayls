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

const ParticipantStorageV1Artifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/ParticipantStorage/ParticipantStorageV1.sol/ParticipantStorageV1.json"
));

task("getParticipantsFromCc", "Get all participants on the VEN").setAction(
  async (taskArgs, { ethers }) => {
    const ccConfig = loadCcConfig();

    const rpcUrl = ccConfig.commitChain.rpcUrl as string;
    const deploymentRegistryAddress = ccConfig.commitChain
      .ccDeploymentProxyRegistry as string;
    const privateKey = ccConfig.commitChain.privateKey as string;

    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Participant Retrieval Process ---`);
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

      const ParticipantStorageV1Address =
        deploymentResult.participantStorageAddress;

      console.log(`Participant Storage Address: ${ParticipantStorageV1Address}`);

      const ParticipantStorageV1Contract = (await getContract(
        ParticipantStorageV1Artifact.abi,
        ParticipantStorageV1Address,
        signer,
        "ParticipantStorageV1"
      )) as any;

      console.log(`Fetching all participants...`);
      const participants = await ParticipantStorageV1Contract.getAllParticipants(VIEW_CALL_GAS_OPTIONS);

      const statusEnum = ["NEW", "ACTIVE", "INACTIVE", "FROZEN"];
      const roleEnum = ["PARTICIPANT", "ISSUER", "AUDITOR"];

      const tableData = participants.map((participant: any) => {
        const statusName = statusEnum[Number(participant.status)];
        const roleName = roleEnum[Number(participant.role)];

        return {
          "Chain ID": participant.chainId.toString(),
          "Role": roleName,
          "Status": statusName,
          "Owner ID": participant.ownerId,
          "Name": participant.name,
          "Created At": new Date(
            Number(participant.createdAt) * 1000
          ).toLocaleString(),
          "Updated At": new Date(
            Number(participant.updatedAt) * 1000
          ).toLocaleString(),
          "Allowed to Broadcast": participant.allowedToBroadcast ? "Yes" : "No",
        };
      });

      if (tableData.length > 0) {
        console.table(tableData);
      } else {
        console.log("No participants found.");
      }

      console.log(`\nTotal participants: ${tableData.length}`);
    } catch (error: any) {
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: signer ? signer.address : undefined });
      process.exit(1);
    }
  }
);