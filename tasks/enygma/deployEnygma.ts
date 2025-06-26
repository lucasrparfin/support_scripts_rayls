import { task } from "hardhat/config";
import * as path from "path";
import { Wallet } from "@ethersproject/wallet";

import { loadDeployerConfig, loadCcConfig } from "../../lib/config-loader";
import { getWalletAndSigner, getContract, pollCondition } from "../../lib/contract-helpers";
import { handleTaskError } from "../../lib/error-handler";
import { TX_GAS_OPTIONS, VIEW_CALL_GAS_OPTIONS, POLL_INTERVAL_MS, MAX_POLL_ATTEMPTS } from "../../lib/constants";

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

task("deployEnygma", "Deploys and registers a Enygma Token")
  .setAction(async (taskArgs, { ethers, network }) => {
    const randHexSuffix = genRanHex(6);
    const deployerConfig = loadDeployerConfig();
    const ccConfig = loadCcConfig();

    const tokenName = deployerConfig.token.name + `_${randHexSuffix}`;
    const tokenSymbol = deployerConfig.token.symbol + `_${randHexSuffix}`;

    const deployerPrivateKey = deployerConfig.deployer.privateKey;
    const rpcUrl = deployerConfig.deployer.rpcUrl;
    const chainId = deployerConfig.deployer.chainId;
    const endpointAddress = deployerConfig.deployer.endpointAddress;

    const ccRpcUrl = ccConfig.commitChain.rpcUrl;
    const ccPrivateKey = ccConfig.commitChain.privateKey;
    const ccProxyRegistryAddress = ccConfig.commitChain.ccDeploymentProxyRegistry;

    let deployerSigner: Wallet | undefined; 
    let ccSigner: Wallet | undefined;

    console.log(`\n--- 🚀 Starting Token Deploy and Registration Process ---`);
    console.log(`Configurations loaded.`);
    console.log(`Token Name: ${tokenName}`);
    console.log(`Token Symbol: ${tokenSymbol}`);
    console.log(`Main Chain ID: ${chainId}`);
    console.log(`Main RPC URL: ${rpcUrl}`);
    console.log(`Endpoint Address (Constructor): ${endpointAddress}`);

    try {
      console.log(`\n1. Setting up Providers and Wallets...`);
      const deployerWalletAndSigner = await getWalletAndSigner(deployerPrivateKey, rpcUrl, "Deployer");
      deployerSigner = deployerWalletAndSigner.signer;
      console.log(`  Deployer Wallet (Main): ${deployerSigner.address}`);

      const ccWalletAndSigner = await getWalletAndSigner(ccPrivateKey, ccRpcUrl, "Commit Chain Deployer");
      ccSigner = ccWalletAndSigner.signer;
      console.log(`  Commit Chain Wallet: ${ccSigner.address}`);

      console.log(`\n2. Deploying ${tokenName} Token...`);
      const EnygmaTokenFactory = new ethers.ContractFactory(
        EnygmaTokenArtifact.abi,
        EnygmaTokenArtifact.bytecode,
        deployerSigner 
      );
      const enygmaToken = await EnygmaTokenFactory.deploy(
        tokenName,
        tokenSymbol,
        endpointAddress
      );

      await enygmaToken.deployed();

      const enygmaTokenAddress = enygmaToken.address;
      console.log(`  ${tokenName} Token deployed at: ${enygmaTokenAddress}`);

      const enygmaTokenContract = (await getContract(
        EnygmaTokenArtifact.abi,
        enygmaTokenAddress,
        deployerSigner, 
        "EnygmaToken"
      )) as any;

      console.log(`\n3. Calling submitTokenRegistration(2) on ${tokenName}...`);
      const submitRegTx = await enygmaTokenContract.submitTokenRegistration(2, TX_GAS_OPTIONS);
      await submitRegTx.wait();
      console.log(`  submitTokenRegistration(2) transaction sent. Hash: ${submitRegTx.hash}`);

      const ccProxyRegistryContract = (await getContract(
        ccProxyRegistryArtifact.abi,
        ccProxyRegistryAddress,
        ccSigner, 
        "CommitChainProxyRegistry"
      )) as any;

      const deployment = await ccProxyRegistryContract.getDeployment();
      console.log(`  Token Registry Address: ${deployment.tokenRegistryAddress}`);

      const tokenRegistryContract = (await getContract(
        tokenRegistryArtifact.abi,
        deployment.tokenRegistryAddress,
        ccSigner, 
        "TokenRegistryV1"
      )) as any;

      console.log(`  Waiting for token '${tokenName}' to appear in TokenRegistry...`);

      let tokenResourceId: string | undefined = undefined;
      const tokenFound = await pollCondition(
        async (): Promise<boolean> => {
          const allTokens = await tokenRegistryContract.getAllTokens(VIEW_CALL_GAS_OPTIONS);
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
        POLL_INTERVAL_MS,
        MAX_POLL_ATTEMPTS
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
      console.log(`  - Deployer Address: ${deployerSigner.address}`);

      console.log(`\n--- ✨ Token Deploy and Registration Finished Successfully! ---`);

    } catch (error: any) {
      handleTaskError(error, { rpcUrl: rpcUrl, walletAddress: deployerSigner ? deployerSigner.address : undefined });
      process.exit(1);
    }
  });