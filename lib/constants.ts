// lib/constants.ts

// Options for transactions that modify state (write operations)
export const TX_GAS_OPTIONS = {
    gasPrice: 0, // Caution: Only use 0 if your network explicitly supports it. Otherwise, set a realistic gas price or let the provider estimate.
    gasLimit: 30000000, // A high gas limit for general transactions. Adjust as needed.
  };
  
  // Options for read-only calls (view/pure functions)
  export const VIEW_CALL_GAS_OPTIONS = {
    gasLimit: 30000000, // A high gas limit for view calls that might iterate large data structures.
  };
  
  export const POLL_INTERVAL_MS = 10000; // 10 seconds
  export const MAX_POLL_ATTEMPTS = 30; // 30 attempts, results in 5 minutes timeout
  
  export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";