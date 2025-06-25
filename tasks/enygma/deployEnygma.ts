import { task } from "hardhat/config";
import * as path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";

const ccConfig = require(path.join(__dirname, "../../config.cc.json"));
const deployerConfig = require(path.join(__dirname, "../../config.deployer.json"));

const EnygmaTokenArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/rayls-protocol/test-contracts/EnygmaTokenExample.sol/EnygmaTokenExample.json"
));

const ccProxyRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/DeploymentProxyRegistry/DeploymentProxyRegistry.sol/DeploymentProxyRegistry.json"
));

const tokenRegistryArtifact = require(path.join(
  __dirname,
  "../../base-artifacts/src/commitChain/TokenRegistry/TokenRegistryV1.sol/TokenRegistryV1.json"
));

function genRanHex(size: number): string {
  return [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");
}

async function pollCondition(
  condition: () => Promise<boolean>,
  interval: number,
  maxAttempts: number
): Promise<boolean> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }
  return false;
}

task("deployEnygma", "Deploys and registers a Enygma Token")
  .setAction(async (taskArgs, { ethers, network }) => {
    const randHexSuffix = genRanHex(6);
    const tokenName = deployerConfig.token.name + `_${randHexSuffix}`;
    const tokenSymbol = deployerConfig.token.symbol + `_${randHexSuffix}`;
    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const chainId = deployerConfig.deployer.chainId;
    const endpointAddress = deployerConfig.deployer.endpointAddress;

    const ccRpcUrl = ccConfig.commitChain.rpcUrl;
    const ccPrivateKey = ccConfig.commitChain.privateKey;
    const ccProxyRegistryAddress = ccConfig.commitChain.ccDeploymentProxyRegistry;

    const ZERO_GAS_SETUP = {
      gasPrice: 0,
      gasLimit: 30000000,
    };

    const VIEW_CALL_GAS_LIMIT = 30000000;

    console.log(`\n--- 🚀 Starting Token Deploy and Registration Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Name: ${tokenName}`);
    console.log(`Token Symbol: ${tokenSymbol}`);
    console.log(`Main Chain ID: ${chainId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address (Constructor): ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const deployerProvider = new JsonRpcProvider(rpcUrl);
      const deployerWallet = new ethers.Wallet(deployerPrivateKey, deployerProvider);
      console.log(`  Deployer Wallet (Main): ${deployerWallet.address}`);

      const ccProvider = new JsonRpcProvider(ccRpcUrl);
      const ccWallet = new ethers.Wallet(ccPrivateKey, ccProvider);
      console.log(`  Commit Chain Wallet: ${ccWallet.address}`);

      console.log(`\n2. Deploying ${tokenName} Token...`);
      const EnygmaTokenFactory = new ethers.ContractFactory(
        EnygmaTokenArtifact.abi,
        EnygmaTokenArtifact.bytecode,
        deployerWallet
      );
      const enygmaToken = await EnygmaTokenFactory.deploy(
        tokenName,
        tokenSymbol,
        endpointAddress
      );

      await enygmaToken.deployed();

      const enygmaTokenAddress = enygmaToken.address;
      console.log(`  ${tokenName} Token deployed at: ${enygmaTokenAddress}`);

      const enygmaTokenContract = new ethers.Contract(
        enygmaTokenAddress,
        EnygmaTokenArtifact.abi,
        deployerWallet
      );

      console.log(`\n3. Calling submitTokenRegistration(2) on ${tokenName}...`);
      const submitRegTx = await enygmaTokenContract.submitTokenRegistration(2, ZERO_GAS_SETUP);
      await submitRegTx.wait();
      console.log(`  submitTokenRegistration(2) transaction sent. Hash: ${submitRegTx.hash}`);

      const ccProxyRegistryContract = new ethers.Contract(
        ccProxyRegistryAddress,
        ccProxyRegistryArtifact.abi,
        ccWallet
      );

      const deployment = await ccProxyRegistryContract.getDeployment();
      console.log(`  Token Registry Address: ${deployment.tokenRegistryAddress}`);

      const tokenRegistryContract = new ethers.Contract(
        deployment.tokenRegistryAddress,
        tokenRegistryArtifact.abi,
        ccWallet
      );

      console.log(`  Waiting for token '${tokenName}' to appear in TokenRegistry...`);

      let tokenResourceId: string | undefined = undefined;
      const tokenFound = await pollCondition(
        async (): Promise<boolean> => {
          const allTokens = await tokenRegistryContract.getAllTokens({ gasLimit: VIEW_CALL_GAS_LIMIT });
          const foundToken = allTokens.find(
            (token: any) =>
              token.name === tokenName && token.symbol === tokenSymbol
          );
          if (foundToken) {
            tokenResourceId = foundToken.resourceId;
            return true;
          }
          return false;
        },
        10000,
        30
      );

      if (!tokenFound || !tokenResourceId) {
        throw new Error(
          `Token ${tokenName} with symbol ${tokenSymbol} not found in TokenRegistry after timeout.`
        );
      }

      console.log(
        `✅ Token found in TokenRegistry with Resource ID: ${tokenResourceId}`
      );

      console.log(`\n4. Verifying deployed contract properties...`);
      const deployedName = await enygmaTokenContract.name();
      const deployedSymbol = await enygmaTokenContract.symbol();
      console.log(`  - Token Name: ${deployedName}`);
      console.log(`  - Token Symbol: ${deployedSymbol}`);
      console.log(`  - Deployer Address: ${deployerWallet.address}`);

      console.log(`\n--- ✨ Token Deploy and Registration Finished Successfully! ---`);

    } catch (error: any) {
      console.error(`\n❌ Token Deploy and Registration Operation Failed:`);
      console.error(`  Message: ${error.message}`);
      if (error.code === "CALL_EXCEPTION" && error.data) {
        console.error(`  EVM Revert Details: ${JSON.stringify(error.data)}`);
      } else if (error.code === "NETWORK_ERROR") {
        console.error(`  Network Error: Check your RPC URL or connection.`);
        console.info(`    Main RPC URL: ${rpcUrl}`);
      } else if (error.code === "UNSUPPORTED_OPERATION") {
        console.error(
          `  Unsupported operation by RPC provider. Check compatibility.`
        );
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        const deployerWallet = new ethers.Wallet(deployerPrivateKey, new JsonRpcProvider(rpcUrl));
        console.error(`  Insufficient funds for the transaction. Check account balance: ${deployerWallet.address}`);
      }
      process.exit(1);
    }
  });