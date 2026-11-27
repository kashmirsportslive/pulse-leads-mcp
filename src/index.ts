import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { queryLeads } from "./leads-engine";
import { getCustomer, deductCredit, registerKey, claimOrGetTrialKey, getClaimedTx, recordClaimedTx, generateSignedPaidKey, initBillingStore } from "./billing";
import { verifyBaseTransaction } from "./onchain-verifier";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Catch malformed JSON payloads cleanly without leaking Express stack traces
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (err && err.type === "entity.parse.failed") {
    if (req.path === "/mcp") {
      return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: Invalid JSON" } });
    }
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  next(err);
});

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const trueIp = req.headers["true-client-ip"];
  if (typeof trueIp === "string" && trueIp.trim()) return trueIp.trim();
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `https://pulse-leads-mcp.onrender.com`;
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS || "0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed";

// Security Utility: Escape HTML to prevent XSS injection attacks
function escapeHtml(str: any): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Security Utility: In-memory sliding-window IP rate limiter
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, action: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  if (ipRateLimits.size > 2000) {
    for (const [k, v] of ipRateLimits.entries()) {
      if (now > v.resetAt) ipRateLimits.delete(k);
    }
  }
  const key = `${action}:${ip}`;
  const record = ipRateLimits.get(key);
  if (!record || now > record.resetAt) {
    ipRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) {
    return false;
  }
  record.count += 1;
  return true;
}

// Setup MCP Server Definition
const mcpServer = new Server(
  {
    name: "pulse-leads-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Register Tool Discovery
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "find_b2b_prospects",
        title: "Find High-Intent B2B Prospects",
        description: "Search and filter multiple high-intent B2B companies by industry and buying intent score. Returns company domains, decision-maker titles, verified email patterns, tech stacks, and hiring triggers. Use get_company_intelligence instead when looking up one specific company or domain.",
        annotations: {
          title: "Find High-Intent B2B Prospects",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              minLength: 4,
              description: "Active PulseLeads API key. Use 'demo_free_key' for evaluation (5 queries/24h per IP), or a purchased key."
            },
            industry: {
              type: "string",
              description: "Industry keyword filter (e.g. 'AI', 'Fintech', 'Real Estate', 'PropTech', 'HealthTech', 'Cybersecurity', 'SaaS'). Leave empty for all industries."
            },
            minIntentScore: {
              type: "number",
              minimum: 0,
              maximum: 100,
              default: 80,
              description: "Minimum buying intent score from 0 to 100 (default: 80)."
            }
          },
          required: ["apiKey"]
        }
      },
      {
        name: "check_account_credits",
        title: "Check Account Credits",
        description: "Check remaining query credits, active subscription tier, and top-up checkout URL for an existing PulseLeads API key.",
        annotations: {
          title: "Check Account Credits",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        },
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              minLength: 4,
              description: "Existing PulseLeads API key to inspect."
            }
          },
          required: ["apiKey"]
        }
      },
      {
        name: "get_company_intelligence",
        title: "Get Company Intelligence",
        description: "Look up intelligence for one specific company name or domain. Returns decision-maker name/title, direct or pattern email, LinkedIn search URL, tech stack, and hiring triggers. Use find_b2b_prospects instead to browse companies by industry.",
        annotations: {
          title: "Get Company Intelligence",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              minLength: 4,
              description: "Active PulseLeads API key (e.g. 'demo_free_key' or a purchased key)."
            },
            companyOrDomain: {
              type: "string",
              minLength: 2,
              description: "Exact company name or domain to look up (e.g. 'anthropic.com', 'Vercel', 'cloudscale.ai')."
            }
          },
          required: ["apiKey", "companyOrDomain"]
        }
      },
      {
        name: "get_pricing_and_checkout",
        title: "Get Pricing and Checkout Info",
        description: "Retrieve PulseLeads pricing tiers (Free Trial, Starter $9, Pro $19, Growth $29), checkout links, and Base Mainnet USDC payment instructions. No API key required.",
        annotations: {
          title: "Get Pricing and Checkout Info",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        },
        inputSchema: {
          type: "object",
          properties: {
            plan: {
              type: "string",
              enum: ["trial", "starter", "pro", "growth"],
              description: "Optional plan filter ('trial', 'starter', 'pro', or 'growth'). Omit to return all plans."
            }
          }
        }
      },
      {
        name: "verify_usdc_payment",
        title: "Verify Base USDC Payment",
        description: "Verify a confirmed Base Mainnet (EVM 8453) USDC transaction hash on-chain and immediately provision an active PulseLeads API key with matching credits.",
        annotations: {
          title: "Verify Base USDC Payment",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        },
        inputSchema: {
          type: "object",
          properties: {
            txHash: {
              type: "string",
              pattern: "^0x[a-fA-F0-9]{64}$",
              description: "66-character Base Mainnet transaction hash starting with 0x."
            },
            plan: {
              type: "string",
              enum: ["starter", "pro", "growth"],
              default: "pro",
              description: "Purchased plan tier: 'starter' ($9 / 500 credits), 'pro' ($19 / 1500 credits), or 'growth' ($29 / 3000 credits)."
            },
            email: {
              type: "string",
              format: "email",
              description: "Optional work email address for payment receipt tracking."
            }
          },
          required: ["txHash"]
        }
      }
    ]
  };
});

// Register Tool Execution with Hybrid Billing Gate
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "check_account_credits") {
    const key = String(args?.apiKey || "");
    const customer = getCustomer(key);
    if (!customer) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "not_found",
              message: "Invalid API key. Visit the pricing portal to acquire credits or use 'demo_free_key' for testing."
            }, null, 2)
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "active",
            plan: customer.plan,
            creditsRemaining: customer.creditsRemaining,
            topUpUrl: `${SERVER_URL}/checkout`
          }, null, 2)
        }
      ]
    };
  }

  if (name === "find_b2b_prospects") {
    const key = String(args?.apiKey || "");
    const customer = getCustomer(key);

    // PAYWALL GATE: If key is missing, invalid or out of credits -> return 402 / payment options
    if (!customer || customer.creditsRemaining <= 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "PaymentRequired",
              httpCode: 402,
              message: "Your query credits are exhausted or your API key is invalid.",
              paymentOptions: {
                checkout_portal: `${SERVER_URL}/checkout?plan=pro`,
                x402_micropayment: {
                  chain: "Base (EVM 8453)",
                  currency: "USDC",
                  costPerCall: "$0.10",
                  recipientWallet: MERCHANT_WALLET,
                  invoiceId: `inv_${Date.now()}`
                },
                free_trial: "You can test with apiKey: 'demo_free_key' or claim a personal key at /checkout?plan=trial"
              }
            }, null, 2)
          }
        ]
      };
    }

    const industry = args?.industry ? String(args.industry) : undefined;
    const minIntent = typeof args?.minIntentScore === "number" ? args.minIntentScore : 80;
    const results = await queryLeads(industry, minIntent);

    // For shared demo_free_key, keep it available for evaluators without global exhaustion
    // (per-IP rate limit is enforced on HTTP /mcp; stdio/local runs cleanly)
    let remainingAfter = customer.creditsRemaining;
    if (key !== "demo_free_key" && results.length > 0) {
      const deduction = deductCredit(key);
      if (!deduction.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "PaymentRequired",
                httpCode: 402,
                message: "Your query credits are exhausted or could not be deducted. Please top up your key.",
                topUpUrl: `${SERVER_URL}/checkout`
              }, null, 2)
            }
          ]
        };
      }
      remainingAfter = deduction.remaining;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "success",
            remainingCredits: remainingAfter,
            count: results.length,
            leads: results
          }, null, 2)
        }
      ]
    };
  }

  if (name === "get_pricing_and_checkout") {
    const requestedPlan = args?.plan ? String(args.plan).toLowerCase() : undefined;
    const plans = [
      { id: "trial", name: "Free Trial", priceUsd: 0, credits: 20, checkoutUrl: `${SERVER_URL}/checkout?plan=trial` },
      { id: "starter", name: "Starter", priceUsd: 9, credits: 500, checkoutUrl: `${SERVER_URL}/checkout?plan=starter` },
      { id: "pro", name: "Pro", priceUsd: 19, credits: 1500, checkoutUrl: `${SERVER_URL}/checkout?plan=pro` },
      { id: "growth", name: "Growth", priceUsd: 29, credits: 3000, checkoutUrl: `${SERVER_URL}/checkout?plan=growth` }
    ];
    const filtered = requestedPlan ? plans.filter((p) => p.id === requestedPlan) : plans;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            settlementNetwork: "Base Mainnet (EVM 8453)",
            acceptedAssets: ["USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)", "USDbC"],
            merchantVault: MERCHANT_WALLET,
            supportEmail: "adammehfuz@gmail.com",
            plans: filtered.length > 0 ? filtered : plans
          }, null, 2)
        }
      ]
    };
  }

  if (name === "get_company_intelligence") {
    const key = String(args?.apiKey || "");
    const target = String(args?.companyOrDomain || "").trim();
    const customer = getCustomer(key);

    if (!customer || customer.creditsRemaining <= 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "PaymentRequired",
              httpCode: 402,
              message: "Your query credits are exhausted or your API key is invalid.",
              checkoutUrl: `${SERVER_URL}/checkout?plan=pro`
            }, null, 2)
          }
        ]
      };
    }

    if (!target) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: "InvalidInput", message: "companyOrDomain is required." }) }]
      };
    }

    const results = await queryLeads(target, 0);
    let remainingAfter = customer.creditsRemaining;
    if (key !== "demo_free_key" && results.length > 0) {
      const deduction = deductCredit(key);
      if (!deduction.success) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "PaymentRequired", httpCode: 402, topUpUrl: `${SERVER_URL}/checkout` }) }]
        };
      }
      remainingAfter = deduction.remaining;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "success",
            query: target,
            remainingCredits: remainingAfter,
            count: results.length,
            matches: results
          }, null, 2)
        }
      ]
    };
  }

  if (name === "verify_usdc_payment") {
    const cleanTx = String(args?.txHash || "").trim().toLowerCase();
    const selectedPlan = String(args?.plan || "pro").toLowerCase();
    const safeEmail = escapeHtml(String(args?.email || "agent@mcp").slice(0, 120));

    if (!cleanTx) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: "InvalidInput", message: "txHash is required." }) }]
      };
    }

    const alreadyClaimed = getClaimedTx(cleanTx);
    if (alreadyClaimed) {
      const existingCustomer = getCustomer(alreadyClaimed.key);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "already_redeemed",
              apiKey: alreadyClaimed.key,
              plan: alreadyClaimed.plan,
              creditsRemaining: existingCustomer ? existingCustomer.creditsRemaining : 0,
              message: "This transaction was already verified. Returning the original active API key."
            }, null, 2)
          }
        ]
      };
    }

    if (pendingTxVerifications.has(cleanTx)) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: "Conflict", message: "Verification already in progress for this txHash. Retry in 3 seconds." }) }]
      };
    }

    pendingTxVerifications.add(cleanTx);
    let verification;
    try {
      verification = await verifyBaseTransaction(cleanTx, MERCHANT_WALLET, selectedPlan);
    } finally {
      pendingTxVerifications.delete(cleanTx);
    }

    if (!verification.verified) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "VerificationFailed",
              reason: verification.reason,
              merchantVault: MERCHANT_WALLET
            }, null, 2)
          }
        ]
      };
    }

    const grantedPlan = verification.matchedPlan || "pro";
    const grantedCredits = verification.grantedCredits || 1500;
    const newPaidKey = generateSignedPaidKey(grantedPlan, cleanTx);

    registerKey({
      key: newPaidKey,
      plan: grantedPlan,
      creditsRemaining: grantedCredits,
      createdAt: new Date().toISOString()
    });

    recordClaimedTx({
      txHash: cleanTx,
      key: newPaidKey,
      plan: grantedPlan,
      amountUsdc: verification.paidAmountUsdc || 0,
      creditsGranted: grantedCredits,
      claimedAt: new Date().toISOString(),
      email: safeEmail
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "verified",
            apiKey: newPaidKey,
            plan: grantedPlan,
            creditsGranted: grantedCredits,
            paidAmountUsdc: verification.paidAmountUsdc,
            blockNumber: verification.blockNumber
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// REST / SSE / Webhook Endpoints
app.get("/", (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PulseLeads MCP Gateway | High-Intent B2B Prospect Intelligence</title>
        <meta name="description" content="Autonomous High-Intent B2B Prospect Intelligence MCP Server for Claude Desktop, Cursor, and AI Agents. Verified decision-maker contacts, tech stacks, and Base USDC settlement." />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="PulseLeads MCP Gateway | High-Intent B2B Prospect Intelligence" />
        <meta property="og:description" content="Connect Claude, Cursor, and AI agents to verified B2B prospect intelligence via Model Context Protocol (MCP). Free trial available." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${SERVER_URL}" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; padding: 40px 20px; line-height: 1.6; }
          .container { max-width: 800px; margin: 0 auto; }
          .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 14px; padding: 36px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #0284c7; color: white; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; letter-spacing: 0.05em; }
          h1 { color: #38bdf8; font-size: 2.2rem; margin: 0 0 12px 0; }
          p.lead { color: #94a3b8; font-size: 1.15rem; margin-bottom: 28px; }
          .pricing-box { background: #090d16; border: 1px solid #22c55e; border-radius: 10px; padding: 24px; margin: 24px 0; }
          .pricing-header { font-size: 1.8rem; font-weight: bold; color: #4ade80; margin-bottom: 8px; }
          .features { list-style: none; padding: 0; margin: 16px 0; }
          .features li { padding: 6px 0; color: #cbd5e1; }
          .features li::before { content: "✓ "; color: #4ade80; font-weight: bold; }
          .btn-group { display: flex; gap: 16px; margin-top: 24px; flex-wrap: wrap; }
          .btn { background: #0284c7; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1rem; display: inline-block; transition: background 0.2s; }
          .btn:hover { background: #0369a1; }
          .btn-outline { background: transparent; border: 2px solid #38bdf8; color: #38bdf8; }
          .btn-outline:hover { background: #38bdf8; color: #0b0f19; }
          .code-box { background: #020617; border: 1px solid #1e293b; padding: 16px; border-radius: 8px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9rem; color: #a5f3fc; margin-top: 24px; word-break: break-all; }
          .footer { margin-top: 36px; text-align: center; color: #64748b; font-size: 0.85rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <span class="badge">Model Context Protocol (MCP)</span>
            <h1>⚡ PulseLeads Intelligence Gateway</h1>
            <p class="lead">Verified Decision-Maker & Tech Stack Intelligence delivered straight into Claude Desktop, Cursor, and Autonomous AI Agents.</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 24px;">
              <div style="background: #131b2e; border: 1px solid #1e293b; border-radius: 10px; padding: 20px; text-align: left; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <h3 style="margin: 0; color: #94a3b8; font-size: 1.1rem;">Free Trial</h3>
                  <div style="font-size: 1.6rem; font-weight: bold; color: #f8fafc; margin: 8px 0;">$0</div>
                  <p style="color: #38bdf8; font-weight: bold; font-size: 0.95rem; margin: 0 0 12px 0;">20 Query Credits</p>
                  <ul class="features" style="font-size: 0.85rem; padding-left: 0; list-style: none;">
                    <li>Full B2B contact intelligence</li>
                    <li>Claude Desktop & Cursor ready</li>
                    <li>Zero credit card required</li>
                  </ul>
                </div>
                <a class="btn btn-outline" style="text-align: center; padding: 10px 16px; margin-top: 14px;" href="/checkout?plan=trial">Get 20 Free Credits</a>
              </div>

              <div style="background: #131b2e; border: 1px solid #334155; border-radius: 10px; padding: 20px; text-align: left; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <h3 style="margin: 0; color: #38bdf8; font-size: 1.1rem;">Starter</h3>
                  <div style="font-size: 1.6rem; font-weight: bold; color: #f8fafc; margin: 8px 0;">$9</div>
                  <p style="color: #4ade80; font-weight: bold; font-size: 0.95rem; margin: 0 0 12px 0;">500 Query Credits</p>
                  <ul class="features" style="font-size: 0.85rem; padding-left: 0; list-style: none;">
                    <li>500 verified B2B leads</li>
                    <li>$0.018 per lead inquiry</li>
                    <li>Instant on-chain activation</li>
                  </ul>
                </div>
                <a class="btn" style="text-align: center; padding: 10px 16px; margin-top: 14px; background: #0284c7;" href="/checkout?plan=starter">Order Starter ($9)</a>
              </div>

              <div style="background: #172554; border: 2px solid #38bdf8; border-radius: 10px; padding: 20px; text-align: left; position: relative; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="position: absolute; top: -11px; right: 14px; background: #38bdf8; color: #0b0f19; font-weight: bold; font-size: 0.72rem; padding: 2px 8px; border-radius: 999px;">POPULAR</div>
                <div>
                  <h3 style="margin: 0; color: #67e8f9; font-size: 1.1rem;">Pro</h3>
                  <div style="font-size: 1.6rem; font-weight: bold; color: #f8fafc; margin: 8px 0;">$19</div>
                  <p style="color: #4ade80; font-weight: bold; font-size: 0.95rem; margin: 0 0 12px 0;">1,500 Query Credits</p>
                  <ul class="features" style="font-size: 0.85rem; padding-left: 0; list-style: none;">
                    <li>1,500 verified decision makers</li>
                    <li>All 5 enterprise tech verticals</li>
                    <li>Standard support & high throughput</li>
                  </ul>
                </div>
                <a class="btn" style="text-align: center; padding: 10px 16px; margin-top: 14px; background: #22c55e; color: #0b0f19;" href="/checkout?plan=pro">Order Pro ($19)</a>
              </div>

              <div style="background: #131b2e; border: 1px solid #eab308; border-radius: 10px; padding: 20px; text-align: left; position: relative; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="position: absolute; top: -11px; right: 14px; background: #eab308; color: #0b0f19; font-weight: bold; font-size: 0.72rem; padding: 2px 8px; border-radius: 999px;">BEST VALUE</div>
                <div>
                  <h3 style="margin: 0; color: #fde047; font-size: 1.1rem;">Growth</h3>
                  <div style="font-size: 1.6rem; font-weight: bold; color: #f8fafc; margin: 8px 0;">$29</div>
                  <p style="color: #4ade80; font-weight: bold; font-size: 0.95rem; margin: 0 0 12px 0;">3,000 Query Credits</p>
                  <ul class="features" style="font-size: 0.85rem; padding-left: 0; list-style: none;">
                    <li>3,000 verified leads & emails</li>
                    <li>Lowest cost: <$0.01 per lead</li>
                    <li>Priority support & custom webhook</li>
                  </ul>
                </div>
                <a class="btn" style="text-align: center; padding: 10px 16px; margin-top: 14px; background: #eab308; color: #0b0f19;" href="/checkout?plan=growth">Order Growth ($29)</a>
              </div>
            </div>

            <h3 style="color: #e2e8f0; margin-top: 32px;">Integration Details for AI Developers</h3>
            <div class="code-box">
              <strong>MCP Endpoint:</strong> POST ${SERVER_URL}/mcp<br/>
              <strong>Settlement Wallet:</strong> 0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed<br/>
              <strong>Free Evaluation Key:</strong> demo_free_key
            </div>

            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-top: 30px; border: 1px solid #334155; text-align: left;">
              <h4 style="margin: 0 0 10px 0; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                <span>💬</span> Customer Support & Help Desk
              </h4>
              <p style="margin: 0 0 8px 0; font-size: 0.92rem; color: #cbd5e1;">
                Experiencing any issues with payments, API key provisioning, or MCP client integration? Our support team responds within 2 hours:
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem; color: #94a3b8; line-height: 1.6;">
                <li><strong>Direct Email:</strong> <a href="mailto:adammehfuz@gmail.com" style="color: #38bdf8; text-decoration: underline;">adammehfuz@gmail.com</a></li>
                <li><strong>Developer Issues:</strong> <a href="https://github.com/kashmirsportslive/pulse-leads-mcp/issues" target="_blank" style="color: #38bdf8; text-decoration: underline;">GitHub Issues Tracker</a></li>
                <li><strong>Blockchain Verification:</strong> <a href="https://basescan.org/address/0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed" target="_blank" style="color: #38bdf8; text-decoration: underline;">View BaseScan Merchant Vault</a></li>
              </ul>
            </div>

            <div class="footer">
              PulseLeads MCP &bull; Open Standards compliant with Model Context Protocol &bull; Transparent pricing, zero hidden charges. Support: adammehfuz@gmail.com
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Transparent Checkout & Key Generation Page
app.get("/checkout", (req: Request, res: Response) => {
  const selectedPlan = String(req.query.plan || "pro").toLowerCase();
  
  if (selectedPlan === "trial" || selectedPlan === "free_trial") {
    const clientIp = getClientIp(req);
    const safeIp = escapeHtml(clientIp);
    const claim = claimOrGetTrialKey(clientIp);

    if (claim.exhausted) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Free Trial Exhausted | PulseLeads</title>
            <style>
              body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
              .box { background: #1f1212; border: 1px solid #ef4444; border-radius: 12px; padding: 36px; max-width: 550px; margin: 0 auto; }
              .btn { background: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="box">
              <h2 style="color: #ef4444; margin-top: 0;">⚠️ Free Trial Credits Exhausted</h2>
              <p>You have already utilized all <strong>20 free evaluation queries</strong> assigned to your network IP (${safeIp}).</p>
              <p style="color: #94a3b8; font-size: 0.9rem;">To continue querying high-intent B2B prospect intelligence, upgrade to our high-speed paid tiers starting at only <strong>$9 for 500 queries</strong>.</p>
              <a class="btn" style="background: #22c55e; color: #0b0f19;" href="/checkout?plan=starter">Upgrade to Starter ($9 for 500 Credits)</a>
              <br/><br/>
              <a href="/" style="color: #38bdf8; font-size: 0.9rem;">Return to Home</a>
            </div>
          </body>
        </html>
      `);
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${claim.isNew ? "Free Trial Activated" : "Your Active Free Trial"} | PulseLeads</title>
          <style>
            body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
            .box { background: #131b2e; border: 1px solid #38bdf8; border-radius: 12px; padding: 36px; max-width: 550px; margin: 0 auto; }
            .key { background: #020617; color: #38bdf8; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 1.2rem; margin: 20px 0; border: 1px dashed #0284c7; word-break: break-all; }
            .btn { background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .badge-ip { display: inline-block; background: #0369a1; color: #e0f2fe; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <div class="box">
            <span class="badge-ip">🔒 Limit: 1 Trial Key Per Network IP (${safeIp})</span>
            <h2 style="color: #38bdf8; margin-top: 0;">${claim.isNew ? "🎉 Free Trial Key Activated!" : "ℹ️ Your Active Free Trial Key"}</h2>
            <p>${claim.isNew ? "You have received <strong>20 free query credits</strong> to evaluate the API." : `You have already claimed a free trial. You have <strong>${claim.creditsRemaining} / 20 credits</strong> remaining.`}</p>
            <div class="key">${claim.key}</div>
            <p style="color: #94a3b8; font-size: 0.9rem;">Paste this key into your AI agent or MCP configuration file.</p>
            <br/>
            <div style="display: flex; gap: 10px; justify-content: center;">
              <a class="btn" href="/">Return to Home</a>
              <a class="btn" style="background: #22c55e; color: #0b0f19;" href="/checkout?plan=starter">Upgrade to Starter ($9)</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  // Tier metadata dictionary
  const TIERS: Record<string, { name: string; price: string; usdc: number; credits: string; desc: string; badge: string; color: string }> = {
    starter: {
      name: "Starter Plan",
      price: "$9.00",
      usdc: 9,
      credits: "500 Credits",
      desc: "Perfect for indie hackers, solo developers, and prototyping.",
      badge: "Hacker Friendly",
      color: "#38bdf8"
    },
    pro: {
      name: "Pro Plan",
      price: "$19.00",
      usdc: 19,
      credits: "1,500 Credits",
      desc: "The standard for growing sales teams and AI agent pipelines.",
      badge: "Most Popular",
      color: "#4ade80"
    },
    growth: {
      name: "Growth Plan",
      price: "$29.00",
      usdc: 29,
      credits: "3,000 Credits",
      desc: "High volume lead scraping with lowest per-contact cost (<$0.01/lead).",
      badge: "Best Value",
      color: "#facc15"
    }
  };

  const currentTier = TIERS[selectedPlan] || TIERS.pro;
  const currentPlanKey = TIERS[selectedPlan] ? selectedPlan : "pro";

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Order ${currentTier.name} | PulseLeads</title>
        <style>
          body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; }
          .box { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 36px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: ${currentTier.color}; margin-top: 0; }
          .price { font-size: 1.8rem; font-weight: bold; color: #f8fafc; margin: 8px 0; }
          .form-group { margin-bottom: 18px; text-align: left; }
          label { display: block; color: #94a3b8; font-size: 0.9rem; margin-bottom: 6px; }
          input { width: 100%; padding: 12px; background: #020617; border: 1px solid #334155; border-radius: 6px; color: white; font-size: 1rem; box-sizing: border-box; }
          .btn-submit { width: 100%; background: #22c55e; color: #0b0f19; padding: 14px; font-size: 1.1rem; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px; }
          .btn-submit:hover { background: #16a34a; }
          .crypto-box { background: #090d16; border: 1px solid #38bdf8; padding: 20px; border-radius: 8px; margin-top: 20px; font-size: 0.9rem; color: #e2e8f0; text-align: left; }
          .crypto-addr { background: #020617; padding: 10px; border-radius: 6px; color: #38bdf8; font-family: monospace; word-break: break-all; margin: 8px 0; border: 1px solid #1e293b; }
          .notice-box { background: #1e1b4b; border: 1px solid #6366f1; padding: 14px; border-radius: 6px; margin-bottom: 20px; font-size: 0.88rem; color: #c7d2fe; }
          .plan-pills { display: flex; gap: 8px; margin-bottom: 20px; }
          .plan-pill { flex: 1; padding: 10px; border-radius: 6px; text-align: center; text-decoration: none; font-size: 0.85rem; font-weight: bold; border: 1px solid #334155; color: #94a3b8; background: #0b0f19; }
          .plan-pill.active { border-color: #38bdf8; background: #172554; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="plan-pills">
            <a class="plan-pill ${currentPlanKey === 'starter' ? 'active' : ''}" href="/checkout?plan=starter">Starter &bull; $9 (500)</a>
            <a class="plan-pill ${currentPlanKey === 'pro' ? 'active' : ''}" href="/checkout?plan=pro">Pro &bull; $19 (1.5k)</a>
            <a class="plan-pill ${currentPlanKey === 'growth' ? 'active' : ''}" href="/checkout?plan=growth">Growth &bull; $29 (3k)</a>
          </div>

          <h2>🔒 PulseLeads: ${currentTier.name}</h2>
          <div class="price">${currentTier.price} &bull; ${currentTier.credits}</div>
          <p style="color: #94a3b8; font-size: 0.9rem; margin: 0 0 16px 0;">${currentTier.desc}</p>

          <div class="notice-box">
            🛡️ <strong>Zero-Trust Payment Gate Active:</strong> API keys are automatically generated upon confirmed on-chain settlement on Base.
          </div>

          <div class="crypto-box">
            <h4 style="margin: 0 0 8px 0; color: #38bdf8;">Web3 Crypto Payment (Base USDC)</h4>
            <p style="margin: 0 0 8px 0; font-size: 0.88rem; color: #cbd5e1;">
              Send exactly <strong>${currentTier.usdc} USDC</strong> on Base network (EVM 8453) to merchant vault:
            </p>
            <div class="crypto-addr">${MERCHANT_WALLET}</div>
            
            <form action="/verify-payment" method="POST" style="margin-top: 14px;">
              <input type="hidden" name="plan" value="${currentPlanKey}" />
              <div class="form-group">
                <label>Your Base Transaction Hash (TxHash)</label>
                <input type="text" name="txHash" placeholder="0x..." required />
              </div>
              <div class="form-group">
                <label>Your Work Email (For Receipt & Key Backup)</label>
                <input type="email" name="email" placeholder="you@company.com" required />
              </div>
              <button type="submit" class="btn-submit">Verify Payment (${currentTier.usdc} USDC) & Get Key</button>
            </form>
          </div>

          <div style="margin-top: 24px; text-align: center; border-top: 1px solid #1e293b; padding-top: 20px;">
            <p style="color: #94a3b8; font-size: 0.88rem; margin-bottom: 6px;">Need help, custom invoices, or experiencing payment issues?</p>
            <p style="color: #38bdf8; font-size: 0.9rem; margin: 0;">
              📧 Contact: <a href="mailto:adammehfuz@gmail.com" style="color: #38bdf8; font-weight: bold; text-decoration: underline;">adammehfuz@gmail.com</a> &bull; 
              <a href="https://github.com/kashmirsportslive/pulse-leads-mcp/issues" target="_blank" style="color: #94a3b8; text-decoration: underline;">GitHub Support</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Strict Activation handler - ONLY generates key if valid payment proof exists
const pendingTxVerifications = new Set<string>();

app.post("/verify-payment", async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);

  // Rate Limiting: Max 12 attempts per minute per IP
  if (!checkRateLimit(clientIp, "verify_payment", 12, 60000)) {
    return res.status(429).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Too Many Requests | PulseLeads</title><style>body{font-family:sans-serif;background:#0b0f19;color:#f1f5f9;padding:40px;text-align:center;}</style></head>
        <body>
          <h2 style="color:#eab308;">⚠️ Rate Limit Exceeded</h2>
          <p>Too many verification attempts from this network. Please wait 60 seconds before retrying.</p>
          <br/><a href="/checkout" style="color:#38bdf8;">Back to Checkout</a>
        </body>
      </html>
    `);
  }

  const { txHash, email, plan } = req.body || {};
  const cleanTx = String(txHash || "").trim().toLowerCase();
  const selectedPlan = String(plan || "pro").toLowerCase();
  const safeEmail = escapeHtml(String(email || "customer").slice(0, 120));
  const safeTx = escapeHtml(cleanTx || "EMPTY");

  // 1. REPLAY PREVENTION: Check if transaction hash has already been redeemed
  const alreadyClaimed = getClaimedTx(cleanTx);
  if (alreadyClaimed) {
    const customer = getCustomer(alreadyClaimed.key);
    const remaining = customer ? customer.creditsRemaining : 0;
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Transaction Already Redeemed | PulseLeads</title>
          <style>
            body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
            .box { background: #131b2e; border: 1px solid #38bdf8; border-radius: 12px; padding: 36px; max-width: 580px; margin: 0 auto; }
            .key { background: #020617; color: #38bdf8; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 1.2rem; margin: 20px 0; border: 1px dashed #0284c7; word-break: break-all; }
            .btn { background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .badge-warn { display: inline-block; background: #854d0e; color: #fef08a; font-size: 0.78rem; padding: 4px 10px; border-radius: 4px; margin-bottom: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="box">
            <span class="badge-warn">🔒 Single-Use Verification: Transaction Already Redeemed</span>
            <h2 style="color: #38bdf8; margin-top: 0;">ℹ️ Your Active Provisioned API Key</h2>
            <p>This transaction (<code>${safeTx.slice(0, 10)}...${safeTx.slice(-8)}</code>) was already verified on <strong>${new Date(alreadyClaimed.claimedAt).toLocaleDateString()}</strong>.</p>
            <p>Here is your active key:</p>
            <div class="key">${alreadyClaimed.key}</div>
            <p>Credits: <strong style="color: #4ade80;">${remaining.toLocaleString()}</strong> remaining on this key.</p>
            <p style="color: #94a3b8; font-size: 0.85rem;">Each blockchain transaction hash can only be redeemed once. If you need more queries, please place a new order.</p>
            <br/>
            <div style="display: flex; gap: 10px; justify-content: center;">
              <a class="btn" href="/">Return to Home</a>
              <a class="btn" style="background: #22c55e; color: #0b0f19;" href="/checkout">New Order</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  // Real-time on-chain verification directly on Base blockchain (with concurrency lock)
  if (pendingTxVerifications.has(cleanTx)) {
    return res.status(409).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Verification In Progress | PulseLeads</title><style>body{font-family:sans-serif;background:#0b0f19;color:#f1f5f9;padding:40px;text-align:center;}</style></head>
        <body>
          <h2 style="color:#eab308;">⏳ Verification Already In Progress</h2>
          <p>This transaction is currently being verified. Please wait 3 seconds and try again.</p>
          <br/><a href="/checkout" style="color:#38bdf8;">Back to Checkout</a>
        </body>
      </html>
    `);
  }

  pendingTxVerifications.add(cleanTx);
  let result;
  try {
    result = await verifyBaseTransaction(cleanTx, MERCHANT_WALLET, selectedPlan);
  } finally {
    pendingTxVerifications.delete(cleanTx);
  }

  if (!result.verified) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Verification Failed</title>
          <style>
            body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
            .box { background: #1f1212; border: 1px solid #ef4444; border-radius: 12px; padding: 36px; max-width: 550px; margin: 0 auto; }
            .btn { background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2 style="color: #ef4444; margin-top: 0;">❌ Blockchain Verification Rejected</h2>
            <p><strong>Reason:</strong> ${escapeHtml(result.reason)}</p>
            <p style="color: #fca5a5; font-family: monospace; word-break: break-all;">TxHash: ${safeTx}</p>
            <p style="color: #94a3b8; font-size: 0.9rem;">The Base blockchain confirmed that no payment reached merchant vault <code>${MERCHANT_WALLET}</code>.</p>
            <div style="background: #2a1515; border: 1px solid #7f1d1d; border-radius: 6px; padding: 12px; margin: 18px 0; font-size: 0.88rem; color: #fca5a5; text-align: left;">
              <strong>Need Help?</strong> If your transaction was recently broadcast, it may take a few seconds to confirm. If you paid and need manual key provisioning, email us directly with your TxHash:
              <br/><br/>
              📧 <strong>Support:</strong> <a href="mailto:adammehfuz@gmail.com?subject=PulseLeads%20Payment%20Assistance" style="color: #67e8f9; text-decoration: underline;">adammehfuz@gmail.com</a>
            </div>
            <br/>
            <a class="btn" href="/checkout">Back to Checkout</a>
          </div>
        </body>
      </html>
    `);
  }

  // Generate verified HMAC-signed key ONLY after confirmed on-chain settlement
  const grantedPlan = result.matchedPlan || "pro";
  const grantedCredits = result.grantedCredits || 1500;
  const newPaidKey = generateSignedPaidKey(grantedPlan, cleanTx);

  registerKey({
    key: newPaidKey,
    plan: grantedPlan as any,
    creditsRemaining: grantedCredits,
    createdAt: new Date().toISOString()
  });

  // Record this TxHash as redeemed to permanently prevent duplicate key claims
  recordClaimedTx({
    txHash: cleanTx,
    key: newPaidKey,
    plan: grantedPlan,
    amountUsdc: result.paidAmountUsdc || 0,
    creditsGranted: grantedCredits,
    claimedAt: new Date().toISOString(),
    email: safeEmail
  });

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Verified | PulseLeads</title>
        <style>
          body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
          .box { background: #131b2e; border: 1px solid #22c55e; border-radius: 12px; padding: 36px; max-width: 550px; margin: 0 auto; }
          .key { background: #020617; color: #4ade80; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 1.2rem; margin: 20px 0; border: 1px solid #22c55e; }
          .btn { background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2 style="color: #4ade80; margin-top: 0;">✅ Blockchain Payment Verified & Confirmed!</h2>
          <p>Plan Activated: <strong style="color: #38bdf8; text-transform: uppercase;">${grantedPlan} Plan</strong></p>
          <p>Base Block: <strong>#${result.blockNumber}</strong> &bull; Amount Verified: <strong>$${result.paidAmountUsdc?.toFixed(2)} USDC</strong></p>
          <p>Payer Address: <span style="font-family: monospace; color: #38bdf8;">${escapeHtml(result.sender)}</span></p>
          <p>Confirmation receipt generated for: <strong>${safeEmail}</strong>.</p>
          <p>Your Pro API Key has been provisioned:</p>
          <div class="key">${newPaidKey}</div>
          <p>Credits: <strong style="color: #4ade80;">${grantedCredits.toLocaleString()} B2B queries</strong> loaded.</p>
          <br/>
          <a class="btn" href="/">Return to Dashboard</a>
        </div>
      </body>
    </html>
  `);
});

// Privacy Policy & Terms of Service Pages (Required for Claude & ChatGPT Directories)
app.get("/privacy", (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Privacy Policy | PulseLeads MCP</title><style>body{font-family:sans-serif;background:#0b0f19;color:#e2e8f0;padding:40px;max-width:760px;margin:0 auto;line-height:1.7}h1,h2{color:#38bdf8}a{color:#38bdf8}</style></head><body><h1>Privacy Policy</h1><p>Effective Date: November 27, 2026</p><p>PulseLeads MCP provides B2B prospect intelligence via the Model Context Protocol (MCP). We collect only the minimum operational data needed to enforce rate limits, prevent abuse, and verify Base Mainnet USDC payments (submitted transaction hashes and optional work email for receipts).</p><h2>Data Usage</h2><ul><li>We do not sell personal data or query logs to third parties.</li><li>On-chain USDC payments are verified directly against public Base Mainnet RPC nodes.</li><li>Support inquiries: <a href="mailto:adammehfuz@gmail.com">adammehfuz@gmail.com</a>.</li></ul><p><a href="/">Back to Home</a></p></body></html>`);
});

app.get("/terms", (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Terms of Service | PulseLeads MCP</title><style>body{font-family:sans-serif;background:#0b0f19;color:#e2e8f0;padding:40px;max-width:760px;margin:0 auto;line-height:1.7}h1,h2{color:#38bdf8}a{color:#38bdf8}</style></head><body><h1>Terms of Service</h1><p>Effective Date: November 27, 2026</p><p>By using PulseLeads MCP, you agree to use the provided B2B intelligence responsibly and in compliance with applicable laws.</p><h2>Payments & Credits</h2><ul><li>Paid API keys are provisioned automatically upon confirmed Base Mainnet USDC settlement to our merchant vault.</li><li>Each transaction hash may be redeemed once within 7 days of confirmation.</li><li>For billing or technical support, contact <a href="mailto:adammehfuz@gmail.com">adammehfuz@gmail.com</a>.</li></ul><p><a href="/">Back to Home</a></p></body></html>`);
});

// Lightweight Health Check Endpoint for Render & Uptime Monitors
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "pulse-leads-mcp",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Glama Connector Ownership Verification
app.get(["/mcp/.well-known/glama.json", "/.well-known/glama.json"], (_req: Request, res: Response) => {
  res.json({
    "$schema": "https://glama.ai/mcp/schemas/connector.json",
    "claim": "glama_claim_iQyOMpALRpl7HGMq6vVNXsLGtyNKivxa"
  });
});

// MCP Gateway Info endpoint for GET probes
app.get("/mcp", (_req: Request, res: Response) => {
  res.json({
    name: "pulse-leads-mcp",
    version: "1.0.0",
    transport: "streamable-http",
    endpoint: `${SERVER_URL}/mcp`,
    protocolVersion: "2024-11-05",
    tools: ["find_b2b_prospects", "check_account_credits", "get_company_intelligence", "get_pricing_and_checkout", "verify_usdc_payment"]
  });
});

// MCP JSON-RPC Gateway endpoint (Streamable HTTP transport)
app.post("/mcp", async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);

  if (!checkRateLimit(clientIp, "mcp_rpc", 60, 60000)) {
    return res.status(429).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: -32029, message: "Rate limit exceeded (60 requests/min). Please slow down." }
    });
  }

  // Per-IP daily cap on shared demo_free_key to prevent bulk scraping while keeping evaluation open
  if (
    req.body?.method === "tools/call" &&
    req.body?.params?.name === "find_b2b_prospects" &&
    req.body?.params?.arguments?.apiKey === "demo_free_key"
  ) {
    if (!checkRateLimit(clientIp, "demo_free_key_daily", 5, 86400000)) {
      return res.json({
        jsonrpc: "2.0",
        id: req.body?.id ?? null,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "PaymentRequired",
                httpCode: 402,
                message: "Daily demo_free_key limit (5 queries/24h) reached for your IP. Claim a personal 20-credit trial key or upgrade.",
                trialUrl: `${SERVER_URL}/checkout?plan=trial`,
                checkoutUrl: `${SERVER_URL}/checkout?plan=pro`
              }, null, 2)
            }
          ]
        }
      });
    }
  }

  try {
    const { method, id } = req.body || {};

    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "pulse-leads-mcp",
            version: "1.0.0"
          }
        }
      });
    }

    if (method === "notifications/initialized" || (typeof method === "string" && method.startsWith("notifications/") && id === undefined)) {
      return id !== undefined
        ? res.json({ jsonrpc: "2.0", id, result: {} })
        : res.status(202).end();
    }

    if (method === "ping") {
      return res.json({ jsonrpc: "2.0", id, result: {} });
    }

    if (method === "resources/list") {
      return res.json({ jsonrpc: "2.0", id, result: { resources: [] } });
    }

    if (method === "prompts/list") {
      return res.json({ jsonrpc: "2.0", id, result: { prompts: [] } });
    }

    if (method === "tools/list") {
      const handler = (mcpServer as any)._requestHandlers.get("tools/list");
      const result = await handler(req.body);
      return res.json({ jsonrpc: "2.0", id, result });
    }

    if (method === "tools/call") {
      const handler = (mcpServer as any)._requestHandlers.get("tools/call");
      const result = await handler(req.body);
      return res.json({ jsonrpc: "2.0", id, result });
    }

    res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not supported" } });
  } catch (err: any) {
    res.status(500).json({ jsonrpc: "2.0", error: { code: -32000, message: err.message || "Internal error" } });
  }
});

async function start() {
  await initBillingStore();
  if (process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio") {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  } else {
    app.listen(PORT, () => {
      console.log(`[PulseLeads MCP] Server running on http://localhost:${PORT}`);
    });
  }
}

start().catch((err) => {
  console.error("[PulseLeads MCP] Startup error:", err);
  process.exit(1);
});
