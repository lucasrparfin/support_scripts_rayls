import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks/participants/getParticipantsFromCc";
import "./tasks/participants/getParticipantsFromReplica";
import "./tasks/participants/syncParticipantsFromReplica";
import "./tasks/tokens/getTokensList";
import "./tasks/tokens/approveToken";
import "./tasks/enygma/deployEnygma";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
