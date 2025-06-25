import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const config = require(path.join(__dirname, "../../config.deployer.json"));

const ParticipantStorageV1ReplicaArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/ParticipantStorageReplica/ParticipantStorageReplicaV1.sol/ParticipantStorageReplicaV1.json"
));

const EndpointContractArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/Endpoint/EndpointV1.sol/EndpointV1.json"
));

const ZERO_GAS_SETUP = {
  gasPrice: 0,
  gasLimit: 30000000,
};

task("syncAllParticipantsFromReplica", "Sync all participants from CC to the Replica").setAction(
  async (taskArgs, { ethers }) => {

    const privateKey = config.deployer.privateKey as string;
    const rpcUrl = config.deployer.rpcUrl as string;
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey);
    const signer = wallet.connect(provider);
    const endpointAddress = config.deployer.endpointAddress as string;

    console.log(`\n--- 🚀 Starting Participant Sync from Commit Chain to Replica Process ---`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address: ${endpointAddress}`);
    console.log(`Deployer Wallet: ${signer.address}`);

    try {
      const EndpointContract = (await ethers.getContractAt(
        EndpointContractArtifact.abi,
        endpointAddress,
        signer
      )) as any;

      const participantStorageReplicaAddress = await EndpointContract.resourceIdToContractAddress("0x0000000000000000000000000000000000000000000000000000000000000001");

      console.log(`Participant Replica Address: ${participantStorageReplicaAddress}`);

      const ParticipantStorageV1ReplicaContract = (await ethers.getContractAt(
        ParticipantStorageV1ReplicaArtifact.abi,
        participantStorageReplicaAddress,
        signer
      )) as any;

      console.log(`Fetching participants before sync...`);
      let beforeParticipants = await ParticipantStorageV1ReplicaContract.getAllParticipants(ZERO_GAS_SETUP);

      console.log(`Before sync: ${beforeParticipants.length} participants`);

      console.log(`Requesting all participants data from Commit Chain...`);
      const tx = await ParticipantStorageV1ReplicaContract.requestAllParticipantsDataFromCommitChain(ZERO_GAS_SETUP);
      console.log(`Request transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log('Request confirmed. Waiting 60 seconds for sync...');

      await new Promise((resolve) => setTimeout(resolve, 60000));

      console.log(`Fetching participants after sync...`);
      let afterParticipants = await ParticipantStorageV1ReplicaContract.getAllParticipants(ZERO_GAS_SETUP);

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
      console.error(`\n❌ Participant Sync Operation Failed:`);
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