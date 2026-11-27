import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface CustomerKey {
  key: string;
  plan: "free_trial" | "starter" | "pro" | "growth" | "pro_subscription" | "x402_micropay";
  creditsRemaining: number;
  expiresAt?: string;
  createdAt: string;
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

export interface ClaimedOrderRecord {
  orderId: string;
  key: string;
  plan: "starter" | "pro" | "growth";
  amountUsd: number;
  creditsGranted: number;
  claimedAt: string;
  refunded?: boolean;
  email?: string;
}

export interface TrialClaimResult {
  key: string;
  isNew: boolean;
  creditsRemaining: number;
  exhausted: boolean;
}

export interface DeductResult {
  success: boolean;
  remaining: number;
}

const DB_FILE = path.join(__dirname, "../data/keys.json");
const TRIAL_IPS_FILE = path.join(__dirname, "../data/trial_ips.json");
const CLAIMED_TX_FILE = path.join(__dirname, "../data/claimed_txs.json");
const CLAIMED_ORDERS_FILE = path.join(__dirname, "../data/claimed_orders.json");

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

const REDIS_KEYS: Record<string, string> = {
  [DB_FILE]: "pulse:keys",
  [TRIAL_IPS_FILE]: "pulse:trial_ips",
  [CLAIMED_TX_FILE]: "pulse:claimed_txs",
  [CLAIMED_ORDERS_FILE]: "pulse:claimed_orders"
};

async function upstashCommand(command: unknown[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const json: any = await res.json();
  return json.result;
}

export async function initBillingStore(): Promise<void> {
  ensureDbExists();
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return;
  }
  for (const [filePath, redisKey] of Object.entries(REDIS_KEYS)) {
    try {
      const raw = await upstashCommand(["GET", redisKey]);
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        if (filePath === DB_FILE && parsed["premium_partner_key"]) {
          delete parsed["premium_partner_key"];
        }
        writeLocalOnly(filePath, parsed);
      } else {
        // Seed Redis with initial local state if empty
        const localRaw = fs.readFileSync(filePath, "utf-8");
        await upstashCommand(["SET", redisKey, localRaw]);
      }
    } catch (err: any) {
      console.error(`[PulseLeads Billing] Upstash sync error for ${redisKey}:`, err.message);
    }
  }
  console.log("[PulseLeads Billing] Persistent Upstash Redis store synchronized.");
}

const KEY_SIGNING_SECRET = (() => {
  if (process.env.KEY_SIGNING_SECRET && process.env.KEY_SIGNING_SECRET.length >= 16) {
    return process.env.KEY_SIGNING_SECRET;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[PulseLeads Billing] WARNING: KEY_SIGNING_SECRET env var not set; using ephemeral runtime secret.");
  }
  return crypto.randomBytes(32).toString("hex");
})();

const PLAN_CREDITS: Record<string, number> = {
  starter: 500,
  pro: 1500,
  growth: 3000
};

function writeLocalOnly(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    fs.copyFileSync(tempPath, filePath);
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

// Atomic file write helper + background sync to Upstash Redis when configured
function atomicWriteJson(filePath: string, data: unknown): void {
  writeLocalOnly(filePath, data);
  const redisKey = REDIS_KEYS[filePath];
  if (redisKey && UPSTASH_URL && UPSTASH_TOKEN) {
    upstashCommand(["SET", redisKey, JSON.stringify(data)]).catch((err) => {
      console.error(`[PulseLeads Billing] Upstash write failed for ${redisKey}:`, err.message);
    });
  }
}

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
      }
    };
    atomicWriteJson(DB_FILE, seed);
  }
  if (!fs.existsSync(TRIAL_IPS_FILE)) {
    atomicWriteJson(TRIAL_IPS_FILE, {});
  }
  if (!fs.existsSync(CLAIMED_TX_FILE)) {
    atomicWriteJson(CLAIMED_TX_FILE, {});
  }
  if (!fs.existsSync(CLAIMED_ORDERS_FILE)) {
    atomicWriteJson(CLAIMED_ORDERS_FILE, {});
  }
}

// Generate a deterministic, HMAC-signed API key tied to the verified txHash.
// Even if ephemeral container storage resets, the key remains cryptographically verifiable.
export function generateSignedPaidKey(plan: "starter" | "pro" | "growth", txHash: string): string {
  const txTag = crypto
    .createHmac("sha256", KEY_SIGNING_SECRET)
    .update(txHash.toLowerCase())
    .digest("hex")
    .slice(0, 12);
  const body = `pulse_${plan}_${txTag}`;
  const sig = crypto
    .createHmac("sha256", KEY_SIGNING_SECRET)
    .update(body)
    .digest("hex")
    .slice(0, 12);
  return `${body}_${sig}`;
}

function verifySignedPaidKey(key: string): { plan: "starter" | "pro" | "growth"; credits: number } | null {
  const match = /^pulse_(starter|pro|growth)_([a-f0-9]{12})_([a-f0-9]{12})$/.exec(key);
  if (!match) return null;
  const plan = match[1] as "starter" | "pro" | "growth";
  const body = `pulse_${plan}_${match[2]}`;
  const expectedSig = crypto
    .createHmac("sha256", KEY_SIGNING_SECRET)
    .update(body)
    .digest("hex")
    .slice(0, 12);

  if (!crypto.timingSafeEqual(Buffer.from(match[3]), Buffer.from(expectedSig))) {
    return null;
  }
  return { plan, credits: PLAN_CREDITS[plan] || 500 };
}

export function claimOrGetTrialKey(clientIp: string): TrialClaimResult {
  ensureDbExists();

  let trialIps: Record<string, { key: string; claimedAt: string }> = {};
  try {
    trialIps = JSON.parse(fs.readFileSync(TRIAL_IPS_FILE, "utf-8"));
  } catch {
    trialIps = {};
  }

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

  const randomHex = crypto.randomBytes(4).toString("hex");
  const newTrialKey = `trial_${randomHex}_${Date.now().toString(36)}`;
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
  atomicWriteJson(TRIAL_IPS_FILE, trialIps);

  return {
    key: newTrialKey,
    isNew: true,
    creditsRemaining: 20,
    exhausted: false
  };
}

export function getCustomer(key: string): CustomerKey | null {
  if (!key || key === "premium_partner_key") {
    return null;
  }
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const data: Record<string, CustomerKey> = JSON.parse(raw);
    if (data[key]) {
      return data[key];
    }
    // Re-hydrate valid HMAC-signed paid keys if ephemeral disk storage was reset
    const signed = verifySignedPaidKey(key);
    if (signed) {
      const recovered: CustomerKey = {
        key,
        plan: signed.plan,
        creditsRemaining: signed.credits,
        createdAt: new Date().toISOString()
      };
      data[key] = recovered;
      atomicWriteJson(DB_FILE, data);
      return recovered;
    }
    return null;
  } catch {
    return null;
  }
}

export function deductCredit(key: string): DeductResult {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const data: Record<string, CustomerKey> = JSON.parse(raw);
    if (!data[key] || data[key].creditsRemaining <= 0) {
      return { success: false, remaining: 0 };
    }
    data[key].creditsRemaining -= 1;
    const remaining = data[key].creditsRemaining;
    atomicWriteJson(DB_FILE, data);
    return { success: true, remaining };
  } catch {
    return { success: false, remaining: 0 };
  }
}

export function registerKey(newKey: CustomerKey): void {
  ensureDbExists();
  let data: Record<string, CustomerKey> = {};
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  data[newKey.key] = newKey;
  atomicWriteJson(DB_FILE, data);
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
  atomicWriteJson(CLAIMED_TX_FILE, data);
}

export function getClaimedOrder(orderId: string): ClaimedOrderRecord | null {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(CLAIMED_ORDERS_FILE, "utf-8");
    const data: Record<string, ClaimedOrderRecord> = JSON.parse(raw);
    return data[orderId] || null;
  } catch {
    return null;
  }
}

export function recordClaimedOrder(record: ClaimedOrderRecord): void {
  ensureDbExists();
  let data: Record<string, ClaimedOrderRecord> = {};
  try {
    data = JSON.parse(fs.readFileSync(CLAIMED_ORDERS_FILE, "utf-8"));
  } catch {
    data = {};
  }
  data[record.orderId] = record;
  atomicWriteJson(CLAIMED_ORDERS_FILE, data);
}

export function revokeKeyByOrder(orderId: string): boolean {
  ensureDbExists();
  const order = getClaimedOrder(orderId);
  if (!order) return false;

  // Mark order as refunded
  order.refunded = true;
  recordClaimedOrder(order);

  // Zero out remaining credits on the associated API key
  try {
    const data: Record<string, CustomerKey> = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    if (data[order.key]) {
      data[order.key].creditsRemaining = 0;
      atomicWriteJson(DB_FILE, data);
    }
    return true;
  } catch {
    return false;
  }
}
