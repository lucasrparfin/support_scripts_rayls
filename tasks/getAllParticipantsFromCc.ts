import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const ccConfig = require(path.join(__dirname, "../config.cc.json"));

const DeploymentProxyRegistryArtifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const ParticipantStorageV1Artifact = require(path.join(
  __dirname,
  "../base-artifacts/src/commitChain/ParticipantStorage/ParticipantStorageV1.sol/ParticipantStorageV1.json"
));

task("getAllParticipantsFromCc", "Get all participants on the VEN").setAction(
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

    const ParticipantStorageV1Address =
      deploymentResult.participantStorageAddress;

    const ParticipantStorageV1Contract = (await ethers.getContractAt(
      ParticipantStorageV1Artifact.abi,
      ParticipantStorageV1Address,
      signer
    )) as any;

    let participants = await ParticipantStorageV1Contract.getAllParticipants();

    const statusEnum = ["NEW", "ACTIVE", "INACTIVE", "FROZEN"];
    const roleEnum = ["PARTICIPANT", "ISSUER", "AUDITOR"];

    const tableData = participants.map((participant: any) => {
      const statusName = statusEnum[Number(participant.status)];
      const roleName = roleEnum[Number(participant.role)];

      return {
        "Chain ID": participant.chainId.toString(), // Convert BigInt/BigNumber to string
        Role: roleName,
        Status: statusName,
        "Owner ID": participant.ownerId,
        Name: participant.name,
        "Created At": new Date(
          Number(participant.createdAt) * 1000
        ).toLocaleString(),
        "Updated At": new Date(
          Number(participant.updatedAt) * 1000
        ).toLocaleString(),
        "Allowed to Broadcast": participant.allowedToBroadcast ? "Yes" : "No", // Display boolean clearly
      };
    });

    if (tableData.length > 0) {
      console.table(tableData);
    } else {
      console.log("No participants found.");
    }

    console.log(`\nTotal participants: ${tableData.length}`);
  }
);
