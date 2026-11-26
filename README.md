# ⚡ PulseLeads Autonomous Monetized MCP Server

Welcome to your production-ready, autonomous MCP revenue engine located right in your workspace: `d:\Caddle\P1`.

---

## 🎯 What Was Built & Verified

This server is an **autonomous B2B High-Intent Tech Leads MCP Server** equipped with dual monetization:
1. **Human / Developer Channel (Stripe Subscription / Credits)**: Generates automated API keys upon checkout (`$29/month` for 1,000 queries).
2. **AI Agent / Autopilot Channel (`x402` HTTP Protocol)**: Accepts autonomous `$0.10 USDC` micro-settlement over Base Network.
3. **Automated Paywall Gate**: If an AI agent or user calls the MCP tool with an exhausted or invalid key, it automatically halts and returns an HTTP 402 with instant checkout links and wallet invoice.

---

## 🚀 How to Run It

### 1. Start the Server
Open PowerShell in `d:\Caddle\P1` and run:
```powershell
npm start
```
Your server will listen at:
* **Landing Page & Web Checkout**: `http://localhost:3000/`
* **MCP RPC Endpoint**: `http://localhost:3000/mcp`

### 2. Verify with Automated Test Client
In another terminal, run:
```powershell
npm test
```
This executes:
- Tool list discovery (`/tools/list`)
- Free test query (`demo_free_key`)
- Paywall rejection test (returning payment links on expired/invalid key)

---

## 💰 How Revenue Enters Your Bank Account (Minimal Touch)

1. **Stripe Integration**:
   - Create a free account at [stripe.com](https://stripe.com).
   - In `.env`, paste your Stripe Secret Key (`STRIPE_SECRET_KEY=sk_live_...`).
   - Payouts will automatically be deposited into your bank account.

2. **Web3 / x402 Micropayments (Base USDC)**:
   - In `.env`, change `MERCHANT_WALLET_ADDRESS` to your personal Base/Coinbase/Metamask address.
   - Any AI agent that pays via micropayment transfers USDC directly to your wallet without intermediary delay.

3. **Deploying Live for 24/7 Zero-Touch Revenue**:
   - Push this directory to GitHub.
   - Click "New Web Service" on [Render.com](https://render.com) or [Railway.app](https://railway.app).
   - Submit your hosted URL to:
     - `punkpeye/awesome-remote-mcp-servers` (via simple pull request)
     - [Glama.ai](https://glama.ai/mcp/servers) (Free MCP directory indexing)
     - [MCPize](https://mcpize.com)
