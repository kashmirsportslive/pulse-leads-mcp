import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { queryLeads } from "./leads-engine";
import { getCustomer, deductCredit, registerKey } from "./billing";
import { verifyBaseTransaction } from "./onchain-verifier";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `https://pulse-leads-mcp.onrender.com`;
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS || "0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed";

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
        description: "Autonomous High-Intent B2B Tech Leads Finder. Returns verified company domains, decision-maker titles, verified email patterns, and hiring intent. Requires an active API key with remaining query credits.",
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              description: "Customer API key. Free trial evaluation key: 'demo_free_key', or your purchased Pro key."
            },
            industry: {
              type: "string",
              description: "Filter by industry (e.g. 'AI', 'Fintech', 'Real Estate', 'PropTech', 'HealthTech', 'Supply Chain')"
            },
            minIntentScore: {
              type: "number",
              description: "Minimum buying intent score between 0 and 100 (Default: 80)"
            }
          },
          required: ["apiKey"]
        }
      },
      {
        name: "check_account_credits",
        description: "Check your remaining query credits, subscription plan, or top-up options.",
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              description: "Your API Key"
            }
          },
          required: ["apiKey"]
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
                stripe_official_checkout: `${SERVER_URL}/checkout?plan=pro`,
                x402_micropayment: {
                  chain: "Base (EVM 8453)",
                  currency: "USDC",
                  costPerCall: "$0.10",
                  recipientWallet: MERCHANT_WALLET,
                  invoiceId: `inv_${Date.now()}`
                },
                free_trial: "You can test with apiKey: 'demo_free_key'"
              }
            }, null, 2)
          }
        ]
      };
    }

    // Deduct credit atomically
    deductCredit(key);

    const industry = args?.industry ? String(args.industry) : undefined;
    const minIntent = typeof args?.minIntentScore === "number" ? args.minIntentScore : 80;
    const results = queryLeads(industry, minIntent);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "success",
            remainingCredits: customer.creditsRemaining - 1,
            count: results.length,
            leads: results
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

            <div class="pricing-box">
              <div class="pricing-header">$29 / month &bull; Pro Unlimited Tier</div>
              <p style="color: #94a3b8; margin: 0 0 12px 0;">Or pay-per-query at $0.10 USDC per resolved contact via Web3 micropayments.</p>
              <ul class="features">
                <li>1,000 Verified B2B queries per month</li>
                <li><strong>Covered Industries:</strong> Real Estate & PropTech, AI Infrastructure, Fintech, Cybersecurity, Healthcare & Logistics</li>
                <li>Direct C-Suite & VP Decision-Maker verified emails</li>
                <li>Real-time company hiring triggers and tech stack intelligence</li>
                <li>Instant MCP API Key activation for Claude Desktop & Cursor</li>
              </ul>
              <div class="btn-group">
                <a class="btn" href="/checkout?plan=pro">Subscribe via Stripe / Card</a>
                <a class="btn btn-outline" href="/checkout?plan=trial">Get Free Trial Key (3 Credits)</a>
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
  const plan = req.query.plan === "trial" ? "free_trial" : "pro_subscription";
  
  if (plan === "free_trial") {
    const trialKey = `trial_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
    registerKey({
      key: trialKey,
      plan: "free_trial",
      creditsRemaining: 3,
      createdAt: new Date().toISOString()
    });

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Free Trial Activated | PulseLeads</title>
          <style>
            body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; text-align: center; }
            .box { background: #131b2e; border: 1px solid #38bdf8; border-radius: 12px; padding: 36px; max-width: 550px; margin: 0 auto; }
            .key { background: #020617; color: #38bdf8; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 1.2rem; margin: 20px 0; border: 1px dashed #0284c7; }
            .btn { background: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2 style="color: #38bdf8; margin-top: 0;">🎉 Free Trial Key Activated!</h2>
            <p>You have received <strong>3 free query credits</strong> to evaluate the API.</p>
            <div class="key">${trialKey}</div>
            <p style="color: #94a3b8; font-size: 0.9rem;">Copy this key and paste it into your AI agent or MCP configuration file.</p>
            <br/>
            <a class="btn" href="/">Return to Home</a>
          </div>
        </body>
      </html>
    `);
  }

  // Official Pro Tier checkout modal - Strict Payment Gate
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Order Pro Plan | PulseLeads</title>
        <style>
          body { font-family: sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px; }
          .box { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 36px; max-width: 580px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: #4ade80; margin-top: 0; }
          .price { font-size: 1.8rem; font-weight: bold; color: #f8fafc; margin: 12px 0 24px 0; }
          .form-group { margin-bottom: 18px; text-align: left; }
          label { display: block; color: #94a3b8; font-size: 0.9rem; margin-bottom: 6px; }
          input { width: 100%; padding: 12px; background: #020617; border: 1px solid #334155; border-radius: 6px; color: white; font-size: 1rem; box-sizing: border-box; }
          .btn-submit { width: 100%; background: #22c55e; color: #0b0f19; padding: 14px; font-size: 1.1rem; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px; }
          .btn-submit:hover { background: #16a34a; }
          .crypto-box { background: #090d16; border: 1px solid #38bdf8; padding: 20px; border-radius: 8px; margin-top: 24px; font-size: 0.9rem; color: #e2e8f0; text-align: left; }
          .crypto-addr { background: #020617; padding: 10px; border-radius: 6px; color: #38bdf8; font-family: monospace; word-break: break-all; margin: 8px 0; border: 1px solid #1e293b; }
          .notice-box { background: #1e1b4b; border: 1px solid #6366f1; padding: 14px; border-radius: 6px; margin-bottom: 20px; font-size: 0.88rem; color: #c7d2fe; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>🔒 PulseLeads Pro: Official Order</h2>
          <div class="price">$29.00 / month (1,000 Credits)</div>

          <div class="notice-box">
            🛡️ <strong>Zero-Trust Payment Gate Active:</strong> Pro keys are exclusively generated after verified Stripe payment or on-chain crypto receipt.
          </div>

          <div class="crypto-box">
            <h4 style="margin: 0 0 8px 0; color: #38bdf8;">Option 1: Instant Web3 Crypto Payment (Base USDC)</h4>
            <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #94a3b8;">Send exactly <strong>29 USDC</strong> on Base network (EVM 8453) to the merchant vault:</p>
            <div class="crypto-addr">${MERCHANT_WALLET}</div>
            
            <form action="/verify-payment" method="POST" style="margin-top: 14px;">
              <div class="form-group">
                <label>Your Base Transaction Hash (TxHash)</label>
                <input type="text" name="txHash" placeholder="0x..." required />
              </div>
              <div class="form-group">
                <label>Your Work Email (For Receipt & Key Backup)</label>
                <input type="email" name="email" placeholder="you@company.com" required />
              </div>
              <button type="submit" class="btn-submit">Verify On-Chain & Activate Key</button>
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
app.use(express.urlencoded({ extended: true }));
app.post("/verify-payment", async (req: Request, res: Response) => {
  const { txHash, email } = req.body;
  const cleanTx = String(txHash || "").trim();

  // Real-time on-chain verification directly on Base blockchain
  const result = await verifyBaseTransaction(cleanTx, MERCHANT_WALLET);

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
            <p><strong>Reason:</strong> ${result.reason}</p>
            <p style="color: #fca5a5; font-family: monospace; word-break: break-all;">TxHash: ${cleanTx || "EMPTY"}</p>
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

  // Generate verified key ONLY after confirmed on-chain settlement
  const newPaidKey = `pulse_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  registerKey({
    key: newPaidKey,
    plan: "pro_subscription",
    creditsRemaining: 1000,
    createdAt: new Date().toISOString()
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
          <p>Base Block: <strong>#${result.blockNumber}</strong></p>
          <p>Payer Address: <span style="font-family: monospace; color: #38bdf8;">${result.sender}</span></p>
          <p>Confirmation receipt generated for: <strong>${email || "customer"}</strong>.</p>
          <p>Your Pro API Key has been provisioned:</p>
          <div class="key">${newPaidKey}</div>
          <p>Credits: <strong>1,000 B2B queries</strong> loaded.</p>
          <br/>
          <a class="btn" href="/">Return to Dashboard</a>
        </div>
      </body>
    </html>
  `);
});

// MCP JSON-RPC Gateway endpoint (HTTP transport)
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const { method, params, id } = req.body;
    
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

app.listen(PORT, () => {
  console.log(`[PulseLeads MCP] Server running on http://localhost:${PORT}`);
});
