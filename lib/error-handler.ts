// lib/error-handler.ts

/**
 * Handles and logs task errors in a standardized format.
 * @param error The error object caught in the try/catch block.
 * @param context An object containing optional context for better error messages (e.g., rpcUrl, walletAddress).
 */
export function handleTaskError(
    error: any,
    context?: { rpcUrl?: string; walletAddress?: string }
  ): void {
    console.error(`\n❌ Operation Failed:`);
    console.error(`Message: ${error.message}`);
  
    if (error.code === "CALL_EXCEPTION") {
      console.error(`EVM Revert Details: ${JSON.stringify(error.data || error.reason)}`);
    } else if (error.code === "NETWORK_ERROR") {
      console.error(`Network Error: Check your RPC URL or connection.`);
      if (context?.rpcUrl) {
        console.info(`  RPC URL: ${context.rpcUrl}`);
      }
    } else if (error.code === "UNSUPPORTED_OPERATION") {
      console.error(`Unsupported operation by RPC provider. Check compatibility.`);
    } else if (error.code === "INSUFFICIENT_FUNDS") {
      if (context?.walletAddress) {
        console.error(`Insufficient funds for the transaction. Check account balance: ${context.walletAddress}`);
      } else {
        console.error(`Insufficient funds for the transaction. Check account balance.`);
      }
    } else if (error.code === "SERVER_ERROR" && error.error && error.error.message) {
      console.error(`RPC Server Error: ${error.error.message}`);
    } else {
      console.error(`Unknown Error: ${JSON.stringify(error)}`);
    }
  }