import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { queryLeads } from "./leads-engine";
import { getCustomer, deductCredit, registerKey } from "./billing";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS || "0x71C8360f3E10D2049A3bE62C1a56daD3Ac32e854";

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
        description: "Autonomous High-Intent B2B Tech Leads Finder. Returns verified company domains, decision-maker titles, verified email patterns, and hiring intent. Requires API key or payment.",
        inputSchema: {
          type: "object",
          properties: {
            apiKey: {
              type: "string",
              description: "Customer API key. Use 'demo_free_key' for a free 3-query test, or your paid key."
            },
            industry: {
              type: "string",
              description: "Filter by industry (e.g. 'AI', 'Fintech', 'HealthTech', 'Supply Chain')"
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
              message: "Invalid API key. Visit http://localhost:3000/pricing to get a subscription key or use 'demo_free_key' for testing."
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
            topUpUrl: `${SERVER_URL}/checkout?plan=pro`
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
                stripe_instant_checkout: `${SERVER_URL}/checkout?plan=pro`,
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
    <html>
      <head>
        <title>PulseLeads MCP Gateway</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
          .card { background: #1e293b; border-radius: 12px; padding: 24px; max-width: 650px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
          h1 { color: #38bdf8; margin-top: 0; }
          .price { font-size: 2rem; font-weight: bold; color: #4ade80; margin: 15px 0; }
          .btn { background: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-top: 10px; }
          .code { background: #090d16; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; color: #a5f3fc; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚡ PulseLeads Autonomous MCP Server</h1>
          <p>High-Intent B2B Prospect Intelligence for AI Agents and Developers.</p>
          <div class="price">$29 / month or $0.10 / call</div>
          <p>Supports instant Stripe checkout and autonomous x402 USDC micropayments.</p>
          <div class="code">MCP Endpoint: POST /mcp<br/>Demo Free Key: demo_free_key</div>
          <br/>
          <a class="btn" href="/checkout?plan=pro">Subscribe via Stripe</a>
        </div>
      </body>
    </html>
  `);
});

// Payment simulation & Key generation endpoint
app.get("/checkout", (req: Request, res: Response) => {
  const plan = req.query.plan === "pro" ? "pro_subscription" : "free_trial";
  const generatedKey = `pulse_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
  
  registerKey({
    key: generatedKey,
    plan: plan as any,
    creditsRemaining: plan === "pro_subscription" ? 1000 : 3,
    createdAt: new Date().toISOString()
  });

  res.send(`
    <html>
      <head>
        <title>Payment Successful - Key Generated</title>
        <style>
          body { font-family: sans-serif; background: #090d16; color: #f1f5f9; padding: 40px; text-align: center; }
          .box { background: #131c31; border: 1px solid #22c55e; border-radius: 10px; padding: 30px; display: inline-block; max-width: 500px; }
          .key { background: #020617; color: #4ade80; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 1.1rem; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2 style="color: #4ade80; margin-top:0;">✅ Payment / Onboarding Success!</h2>
          <p>Your autonomous MCP API key has been generated:</p>
          <div class="key">${generatedKey}</div>
          <p>Credits: <strong>1,000 queries</strong> added.</p>
          <p style="color: #94a3b8; font-size: 0.85rem;">Paste this key in your AI client (Cursor, Claude Desktop, or LangChain agent) to access leads.</p>
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
