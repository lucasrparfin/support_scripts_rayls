import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadDeployerConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";
import { TX_GAS_OPTIONS, VIEW_CALL_GAS_OPTIONS } from "../../lib/constants";

const ParticipantStorageV1ReplicaArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/ParticipantStorageReplica/ParticipantStorageReplicaV1.sol/ParticipantStorageReplicaV1.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

task("syncAllParticipantsFromReplica", "Sync all participants from CC to the Replica").setAction(
  async (taskArgs, { ethers }) => {
    const config = loadDeployerConfig();

    const privateKey = config.deployer.privateKey as string;
    const rpcUrl = config.deployer.rpcUrl as string;
    const endpointAddress = config.deployer.endpointAddress as string;

    let signer: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Participant Sync from Commit Chain to Replica Process ---`);
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

      console.log(`Fetching participants before sync...`);
      let beforeParticipants = await ParticipantStorageV1ReplicaContract.getAllParticipants(VIEW_CALL_GAS_OPTIONS);

      console.log(`Before sync: ${beforeParticipants.length} participants`);

      console.log(`Requesting all participants data from Commit Chain...`);
      const tx = await ParticipantStorageV1ReplicaContract.requestAllParticipantsDataFromCommitChain(TX_GAS_OPTIONS);
      console.log(`Request transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log('Request confirmed. Waiting 60 seconds for sync...');

      await new Promise((resolve) => setTimeout(resolve, 60000));

      console.log(`Fetching participants after sync...`);
      let afterParticipants = await ParticipantStorageV1ReplicaContract.getAllParticipants(VIEW_CALL_GAS_OPTIONS);

      console.log('After sync participants list: ');

      const statusEnum = ["NEW", "ACTIVE", "INACTIVE", "FROZEN"];
      const roleEnum = ["PARTICIPANT", "ISSUER", "AUDITOR"];

      const tableData = afterParticipants.map((participant: any) => {
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

      if (afterParticipants.length > beforeParticipants.length) {
        console.log(`✔ Sync successful! ${afterParticipants.length - beforeParticipants.length} new participants added.`);
      } else if (afterParticipants.length === beforeParticipants.length) {
        console.warn('⚠ No new participants detected. Data may already have been synced or is still in transit.');
      } else {
        console.error('❌ Unexpected issue: participant count decreased.');
      }
    } catch (error: any) {
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: signer ? signer.address : undefined });
      process.exit(1);
    }
  }
);