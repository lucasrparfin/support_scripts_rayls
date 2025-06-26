// lib/config-loader.ts

import * as path from "path";

interface DeployerConfig {
  deployer: {
    privateKey: string;
    rpcUrl: string;
    chainId: number;
    endpointAddress: string;
  };
  token: {
    resourceId: string;
    name: string;
    symbol: string;
  };
}

interface CcConfig {
  commitChain: {
    privateKey: string;
    rpcUrl: string;
    chainId: number;
    ccDeploymentProxyRegistry: string;
  };
}

interface ReceiverConfig {
  receiver: {
    privateKey: string;
    rpcUrl: string;
    chainId: number;
  };
}

// Function to load deployer configuration
export function loadDeployerConfig(): DeployerConfig {
  return require(path.join(__dirname, "../config.deployer.json"));
}

// Function to load commit chain configuration
export function loadCcConfig(): CcConfig {
  return require(path.join(__dirname, "../config.cc.json"));
}

// Function to load receiver configuration
export function loadReceiverConfig(): ReceiverConfig {
  return require(path.join(__dirname, "../config.receiver.json"));
}