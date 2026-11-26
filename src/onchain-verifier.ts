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

// Queries Base Mainnet RPC directly to check if the transaction is real, confirmed, and paid to our wallet
// ERC-20 Transfer Event Signature: Transfer(address,address,uint256)
// Topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Tier Thresholds in USDC raw units (6 decimals)
const PLAN_THRESHOLDS = {
  starter: { minRaw: BigInt(9 * 1000000), credits: 500, price: 9, name: "Starter" },
  pro: { minRaw: BigInt(19 * 1000000), credits: 1000, price: 19, name: "Pro" },
  growth: { minRaw: BigInt(29 * 1000000), credits: 3000, price: 29, name: "Growth" }
};

export async function verifyBaseTransaction(
  txHash: string,
  merchantWallet: string,
  selectedPlan: string = "pro"
): Promise<TxVerificationResult> {
  const cleanTx = txHash.trim();
  if (!/^0x([A-Fa-f0-9]{64})$/.test(cleanTx)) {
    return { verified: false, reason: "Invalid transaction hash format. Must be 66 hex characters starting with 0x." };
  }

  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionReceipt",
    params: [cleanTx]
  });

  return new Promise((resolve) => {
    const req = https.request(
      "https://mainnet.base.org",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const receipt = json.result;

            if (!receipt) {
              return resolve({ verified: false, reason: "Transaction not found on Base blockchain. Please wait for network confirmation." });
            }

            if (receipt.status !== "0x1") {
              return resolve({ verified: false, reason: "Transaction failed or reverted on blockchain." });
            }

            const merchantTopic = merchantWallet.toLowerCase().replace("0x", "").padStart(64, "0");
            let paidAmountUsdc = BigInt(0);
            let validTransferFound = false;

            // Strict log inspection: Check Transfer event, recipient topic, and exact amount
            if (receipt.logs && Array.isArray(receipt.logs)) {
              for (const log of receipt.logs) {
                if (
                  log.topics &&
                  log.topics.length >= 3 &&
                  log.topics[0].toLowerCase() === TRANSFER_EVENT_TOPIC &&
                  log.topics[2].toLowerCase().includes(merchantTopic)
                ) {
                  // Data field contains the raw transfer amount in uint256
                  try {
                    const rawVal = BigInt(log.data || "0x0");
                    paidAmountUsdc += rawVal;
                    validTransferFound = true;
                  } catch (e) {}
                }
              }
            }

            if (!validTransferFound) {
              return resolve({
                verified: false,
                reason: `No transfer to merchant vault (${merchantWallet}) found in transaction logs.`
              });
            }

            const actualPaidNumber = Number(paidAmountUsdc) / 1000000;
            const actualPaidFormatted = actualPaidNumber.toFixed(2);

            // Determine required minimum based on selected plan
            const planKey = (selectedPlan === "starter" || selectedPlan === "growth") ? selectedPlan : "pro";
            const expectedTier = PLAN_THRESHOLDS[planKey];

            if (paidAmountUsdc < expectedTier.minRaw) {
              return resolve({
                verified: false,
                reason: `Insufficient payment amount. Selected plan (${expectedTier.name}) requires ${expectedTier.price}.00 USDC, but this transaction only sent ${actualPaidFormatted} USDC.`
              });
            }

            // Award matching or upgraded tier based on actual paid amount:
            let grantedCredits = 500;
            let matchedPlan: "starter" | "pro" | "growth" = "starter";

            if (paidAmountUsdc >= PLAN_THRESHOLDS.growth.minRaw) {
              grantedCredits = PLAN_THRESHOLDS.growth.credits; // 3,000 credits
              matchedPlan = "growth";
            } else if (paidAmountUsdc >= PLAN_THRESHOLDS.pro.minRaw) {
              grantedCredits = PLAN_THRESHOLDS.pro.credits; // 1,000 credits
              matchedPlan = "pro";
            } else if (paidAmountUsdc >= PLAN_THRESHOLDS.starter.minRaw) {
              grantedCredits = PLAN_THRESHOLDS.starter.credits; // 500 credits
              matchedPlan = "starter";
            }

            resolve({
              verified: true,
              sender: receipt.from,
              recipient: merchantWallet,
              blockNumber: parseInt(receipt.blockNumber, 16),
              paidAmountUsdc: actualPaidNumber,
              grantedCredits,
              matchedPlan
            });
          } catch (err: any) {
            resolve({ verified: false, reason: "RPC error parsing transaction: " + err.message });
          }
        });
      }
    );

    req.on("error", (err) => {
      resolve({ verified: false, reason: "Base RPC connection failed: " + err.message });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ verified: false, reason: "Base RPC timeout verifying transaction." });
    });

    req.write(payload);
    req.end();
  });
}
