import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks/getParticipantsFromCc.ts";
import "./tasks/getParticipantsFromReplica.ts";
import "./tasks/syncParticipantsFromReplica.ts";
import "./tasks/getTokensList.ts";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
