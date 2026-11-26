import fs from "fs";
import path from "path";

export interface CustomerKey {
  key: string;
  plan: "free_trial" | "pro_subscription" | "x402_micropay";
  creditsRemaining: number;
  expiresAt?: string;
  createdAt: string;
}

const DB_FILE = path.join(__dirname, "../data/keys.json");

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
        creditsRemaining: 3,
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
