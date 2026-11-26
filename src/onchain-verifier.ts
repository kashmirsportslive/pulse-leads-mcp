import https from "https";

export interface TxVerificationResult {
  verified: boolean;
  reason?: string;
  sender?: string;
  recipient?: string;
  blockNumber?: number;
}

// Queries Base Mainnet RPC directly to check if the transaction is real, confirmed, and paid to our wallet
export async function verifyBaseTransaction(txHash: string, merchantWallet: string): Promise<TxVerificationResult> {
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

            // Check if transaction status is 0x1 (Success)
            if (receipt.status !== "0x1") {
              return resolve({ verified: false, reason: "Transaction failed or reverted on blockchain." });
            }

            const toAddress = (receipt.to || "").toLowerCase();
            const merchantAddr = merchantWallet.toLowerCase();

            // Verify if direct payment was sent to merchant wallet, or interact with USDC token contract
            // Base USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
            const isDirectToMerchant = toAddress === merchantAddr;
            const isUsdcTransfer = receipt.logs && receipt.logs.some((log: any) => {
              return log.topics && log.topics.some((t: string) => t.toLowerCase().includes(merchantAddr.replace("0x", "")));
            });

            if (!isDirectToMerchant && !isUsdcTransfer) {
              return resolve({
                verified: false,
                reason: `Payment recipient mismatch. Funds were not delivered to merchant vault (${merchantWallet}).`
              });
            }

            resolve({
              verified: true,
              sender: receipt.from,
              recipient: receipt.to,
              blockNumber: parseInt(receipt.blockNumber, 16)
            });
          } catch (err: any) {
            resolve({ verified: false, reason: "RPC network error checking blockchain: " + err.message });
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
