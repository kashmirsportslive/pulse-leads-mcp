import https from "https";

export interface TxVerificationResult {
  verified: boolean;
  reason?: string;
  sender?: string;
  recipient?: string;
  blockNumber?: number;
  paidAmountUsdc?: number;
  grantedCredits?: number;
  matchedPlan?: "starter" | "pro" | "growth";
}

// ERC-20 Transfer Event Signature: Transfer(address,address,uint256)
const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Strict whitelist of authentic Base USDC token contract addresses
const OFFICIAL_USDC_CONTRACTS = [
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Official Native Base USDC (Circle)
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"  // Official Bridged USDbC (Base Bridge)
];

// Base produces ~1 block every 2 seconds -> ~302,400 blocks = 7 days
const MAX_TX_AGE_BLOCKS = 302400;

// Failover list of public Base Mainnet JSON-RPC endpoints
const BASE_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://1rpc.io/base"
];

// Tier Thresholds in USDC raw units (6 decimals)
const PLAN_THRESHOLDS = {
  starter: { minRaw: BigInt(9 * 1000000), credits: 500, price: 9, name: "Starter" },
  pro: { minRaw: BigInt(19 * 1000000), credits: 1500, price: 19, name: "Pro" },
  growth: { minRaw: BigInt(29 * 1000000), credits: 3000, price: 29, name: "Growth" }
};

function callBaseRpc(rpcUrl: string, method: string, params: unknown[]): Promise<any> {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      rpcUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PulseLeads-MCP/1.0",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`RPC HTTP ${res.statusCode}`));
          }
          try {
            const json = JSON.parse(data);
            if (json.error) {
              return reject(new Error(json.error.message || "RPC error"));
            }
            resolve(json.result);
          } catch (err: any) {
            reject(new Error("Invalid RPC JSON: " + err.message));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(7000, () => {
      req.destroy();
      reject(new Error("RPC timeout"));
    });

    req.write(payload);
    req.end();
  });
}

async function callBaseRpcWithFailover(method: string, params: unknown[]): Promise<any> {
  let lastError: Error | null = null;
  for (const url of BASE_RPC_URLS) {
    try {
      return await callBaseRpc(url, method, params);
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error("All Base RPC endpoints failed");
}

export async function verifyBaseTransaction(
  txHash: string,
  merchantWallet: string,
  selectedPlan: string = "pro"
): Promise<TxVerificationResult> {
  const cleanTx = txHash.trim();
  if (!/^0x([A-Fa-f0-9]{64})$/.test(cleanTx)) {
    return { verified: false, reason: "Invalid transaction hash format. Must be 66 hex characters starting with 0x." };
  }

  try {
    const [receipt, latestBlockHex] = await Promise.all([
      callBaseRpcWithFailover("eth_getTransactionReceipt", [cleanTx]),
      callBaseRpcWithFailover("eth_blockNumber", [])
    ]);

    if (!receipt) {
      return { verified: false, reason: "Transaction not found on Base blockchain. Please wait for network confirmation." };
    }

    if (receipt.status !== "0x1") {
      return { verified: false, reason: "Transaction failed or reverted on blockchain." };
    }

    const txBlock = parseInt(receipt.blockNumber, 16);
    const latestBlock = parseInt(latestBlockHex, 16);
    if (!isNaN(txBlock) && !isNaN(latestBlock) && latestBlock - txBlock > MAX_TX_AGE_BLOCKS) {
      return {
        verified: false,
        reason: "Transaction is older than 7 days and is outside the automated redemption window. Contact support with your TxHash for manual assistance."
      };
    }

    const expectedRecipientTopic = "0x" + merchantWallet.toLowerCase().replace("0x", "").padStart(64, "0");
    let paidAmountUsdc = BigInt(0);
    let validTransferFound = false;

    if (receipt.logs && Array.isArray(receipt.logs)) {
      for (const log of receipt.logs) {
        const tokenContract = String(log.address || "").toLowerCase();
        const isOfficialUsdc = OFFICIAL_USDC_CONTRACTS.includes(tokenContract);

        if (
          isOfficialUsdc &&
          log.topics &&
          log.topics.length >= 3 &&
          String(log.topics[0]).toLowerCase() === TRANSFER_EVENT_TOPIC &&
          String(log.topics[2]).toLowerCase() === expectedRecipientTopic
        ) {
          try {
            const rawVal = BigInt(log.data || "0x0");
            paidAmountUsdc += rawVal;
            validTransferFound = true;
          } catch {}
        }
      }
    }

    if (!validTransferFound) {
      return {
        verified: false,
        reason: `No official Base USDC transfer to merchant vault (${merchantWallet}) found in transaction logs. (Only genuine Circle Native USDC 0x833589... or USDbC is accepted).`
      };
    }

    const actualPaidNumber = Number(paidAmountUsdc) / 1000000;
    const actualPaidFormatted = actualPaidNumber.toFixed(2);

    const planKey = (selectedPlan === "starter" || selectedPlan === "growth") ? selectedPlan : "pro";
    const expectedTier = PLAN_THRESHOLDS[planKey];

    if (paidAmountUsdc < expectedTier.minRaw) {
      return {
        verified: false,
        reason: `Insufficient payment amount. Selected plan (${expectedTier.name}) requires ${expectedTier.price}.00 USDC, but this transaction only sent ${actualPaidFormatted} USDC.`
      };
    }

    let grantedCredits = 500;
    let matchedPlan: "starter" | "pro" | "growth" = "starter";

    if (paidAmountUsdc >= PLAN_THRESHOLDS.growth.minRaw) {
      grantedCredits = PLAN_THRESHOLDS.growth.credits;
      matchedPlan = "growth";
    } else if (paidAmountUsdc >= PLAN_THRESHOLDS.pro.minRaw) {
      grantedCredits = PLAN_THRESHOLDS.pro.credits;
      matchedPlan = "pro";
    } else if (paidAmountUsdc >= PLAN_THRESHOLDS.starter.minRaw) {
      grantedCredits = PLAN_THRESHOLDS.starter.credits;
      matchedPlan = "starter";
    }

    return {
      verified: true,
      sender: receipt.from,
      recipient: merchantWallet,
      blockNumber: txBlock,
      paidAmountUsdc: actualPaidNumber,
      grantedCredits,
      matchedPlan
    };
  } catch (err: any) {
    return { verified: false, reason: "Base RPC error verifying transaction: " + err.message };
  }
}
