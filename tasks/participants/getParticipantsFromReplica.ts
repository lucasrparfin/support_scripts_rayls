import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadDeployerConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";
import { VIEW_CALL_GAS_OPTIONS } from "../../lib/constants";

const ParticipantStorageV1ReplicaArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/ParticipantStorageReplica/ParticipantStorageReplicaV1.sol/ParticipantStorageReplicaV1.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

task("getAllParticipantsFromReplica", "Get all participants on the Replica").setAction(
  async (taskArgs, { ethers }) => {
    const deployerConfig = loadDeployerConfig();

    const privateKey = deployerConfig.deployer.privateKey as string;
    const rpcUrl = deployerConfig.deployer.rpcUrl as string;
    const endpointAddress = deployerConfig.deployer.endpointAddress as string;

    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Participant Retrieval From Replica Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);

    try {
      const walletAndSigner = await getWalletAndSigner(privateKey, rpcUrl, "Deployer");
      signer = walletAndSigner.signer;
      console.log(`Deployer Wallet: ${signer.address}`);

      const EndpointContract = (await getContract(
        EndpointContractArtifact.abi,
        endpointAddress,
        signer,
        "Endpoint"
      )) as any;

      const participantStorageReplicaAddress = await EndpointContract.resourceIdToContractAddress("0x0000000000000000000000000000000000000000000000000000000000000001");

      console.log(`Participant Replica Address: ${participantStorageReplicaAddress}`);

      const ParticipantStorageV1ReplicaContract = (await getContract(
        ParticipantStorageV1ReplicaArtifact.abi,
        participantStorageReplicaAddress,
        signer,
        "ParticipantStorageV1Replica"
      )) as any;

      console.log(`Fetching all participants from Replica...`);
      let participants = await ParticipantStorageV1ReplicaContract.getAllParticipants(VIEW_CALL_GAS_OPTIONS);

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