import fs from "fs";
import path from "path";

export interface CustomerKey {
  key: string;
  plan: "free_trial" | "starter" | "pro" | "growth" | "pro_subscription" | "x402_micropay";
  creditsRemaining: number;
  expiresAt?: string;
  createdAt: string;
}

const DB_FILE = path.join(__dirname, "../data/keys.json");
const TRIAL_IPS_FILE = path.join(__dirname, "../data/trial_ips.json");
const CLAIMED_TX_FILE = path.join(__dirname, "../data/claimed_txs.json");

function ensureDbExists() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed: Record<string, CustomerKey> = {
      "demo_free_key": {
        key: "demo_free_key",
        plan: "free_trial",
        creditsRemaining: 20,
        createdAt: new Date().toISOString()
      },
      "premium_partner_key": {
        key: "premium_partner_key",
        plan: "pro_subscription",
        creditsRemaining: 999999,
        createdAt: new Date().toISOString()
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf-8");
  }
  if (!fs.existsSync(TRIAL_IPS_FILE)) {
    fs.writeFileSync(TRIAL_IPS_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
  if (!fs.existsSync(CLAIMED_TX_FILE)) {
    fs.writeFileSync(CLAIMED_TX_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

export interface ClaimedTxRecord {
  txHash: string;
  key: string;
  plan: string;
  amountUsdc: number;
  creditsGranted: number;
  claimedAt: string;
  email?: string;
}

export function getClaimedTx(txHash: string): ClaimedTxRecord | null {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(CLAIMED_TX_FILE, "utf-8");
    const data: Record<string, ClaimedTxRecord> = JSON.parse(raw);
    return data[txHash.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export function recordClaimedTx(record: ClaimedTxRecord): void {
  ensureDbExists();
  let data: Record<string, ClaimedTxRecord> = {};
  try {
    data = JSON.parse(fs.readFileSync(CLAIMED_TX_FILE, "utf-8"));
  } catch {
    data = {};
  }
  data[record.txHash.toLowerCase()] = record;
  fs.writeFileSync(CLAIMED_TX_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export interface TrialClaimResult {
  key: string;
  isNew: boolean;
  creditsRemaining: number;
  exhausted: boolean;
}

export function claimOrGetTrialKey(clientIp: string): TrialClaimResult {
  ensureDbExists();

  let trialIps: Record<string, { key: string; claimedAt: string }> = {};
  try {
    trialIps = JSON.parse(fs.readFileSync(TRIAL_IPS_FILE, "utf-8"));
  } catch {
    trialIps = {};
  }

  // If this IP already claimed a key, return their existing key
  if (trialIps[clientIp]) {
    const existingKey = trialIps[clientIp].key;
    const customer = getCustomer(existingKey);
    const credits = customer ? customer.creditsRemaining : 0;
    return {
      key: existingKey,
      isNew: false,
      creditsRemaining: credits,
      exhausted: credits <= 0
    };
  }

  // First time claiming from this IP: provision single trial key
  const newTrialKey = `trial_${Math.random().toString(36).substring(2, 7)}_${Date.now().toString(36)}`;
  registerKey({
    key: newTrialKey,
    plan: "free_trial",
    creditsRemaining: 20,
    createdAt: new Date().toISOString()
  });

  trialIps[clientIp] = {
    key: newTrialKey,
    claimedAt: new Date().toISOString()
  };
  fs.writeFileSync(TRIAL_IPS_FILE, JSON.stringify(trialIps, null, 2), "utf-8");

  return {
    key: newTrialKey,
    isNew: true,
    creditsRemaining: 20,
    exhausted: false
  };
}

export function getCustomer(key: string): CustomerKey | null {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const data: Record<string, CustomerKey> = JSON.parse(raw);
    return data[key] || null;
  } catch {
    return null;
  }
}

export function deductCredit(key: string): boolean {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const data: Record<string, CustomerKey> = JSON.parse(raw);
    if (!data[key] || data[key].creditsRemaining <= 0) {
      return false;
    }
    data[key].creditsRemaining -= 1;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function registerKey(newKey: CustomerKey): void {
  ensureDbExists();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  const data: Record<string, CustomerKey> = JSON.parse(raw);
  data[newKey.key] = newKey;
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}
