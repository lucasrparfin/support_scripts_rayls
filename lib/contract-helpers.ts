// lib/contract-helpers.ts

import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { Contract, providers, Signer } from "ethers"; // Import types for ethers v5
import * as ethers from "ethers"; // Import ethers for its utilities (ethers.utils)

interface WalletAndSigner {
  provider: JsonRpcProvider;
  wallet: Wallet;
  signer: Wallet; // signer is typically the connected wallet
}

/**
 * Sets up a JsonRpcProvider and a connected Wallet signer.
 * @param privateKey The private key of the account.
 * @param rpcUrl The RPC URL for the network.
 * @param walletName An optional name for logging purposes.
 * @returns An object containing the provider, wallet, and signer.
 */
export async function getWalletAndSigner(
  privateKey: string,
  rpcUrl: string,
  walletName: string = "Wallet"
): Promise<WalletAndSigner> {
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey);
  const signer = wallet.connect(provider);
  // Log message removed as per "no comments" in final tasks.
  // console.log(`  ${walletName} Wallet: ${signer.address}`);
  return { provider, wallet, signer };
}

/**
 * Gets an instance of a smart contract.
 * Assumes ethers is available from Hardhat Runtime Environment for getContractAt.
 * @param abi The ABI of the contract.
 * @param contractAddress The address of the deployed contract.
 * @param signerOrProvider The signer or provider to connect the contract to.
 * @param contractName An optional name for logging purposes.
 * @returns An instance of the ethers.Contract.
 */
export async function getContract(
  abi: any, // Use `any` here if you don't have generated Typechain types, or the specific `ContractInterface` if available
  contractAddress: string,
  signerOrProvider: Signer | providers.Provider,
  contractName: string = "Contract"
): Promise<Contract> {
  // Use `ethers.Contract` directly, assuming Hardhat's ethers context
  const contract = new ethers.Contract(contractAddress, abi, signerOrProvider);
  // Log message removed as per "no comments" in final tasks.
  // console.log(`  ${contractName} Contract instance at: ${contractAddress}`);
  return contract;
}

/**
 * Polls a condition asynchronously until it returns true or max attempts are reached.
 * @param condition A function that returns a Promise<boolean>.
 * @param interval The interval in milliseconds between polls.
 * @param maxAttempts The maximum number of attempts before giving up.
 * @returns A Promise that resolves to true if the condition is met, false otherwise.
 */
export async function pollCondition(
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