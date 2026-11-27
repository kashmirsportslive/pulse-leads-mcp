# ⚡ PulseLeads MCP Server

[![Glama MCP](https://glama.ai/mcp/servers/kashmirsportslive/pulse-leads-mcp/badge)](https://glama.ai/mcp/servers/kashmirsportslive/pulse-leads-mcp)
[![Live Cloud Endpoint](https://img.shields.io/badge/Render-24%2F7%20Online-22c55e)](https://pulse-leads-mcp.onrender.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Autonomous High-Intent B2B Prospect Intelligence for AI Agents, Developers, and Sales Teams. Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

---

## 🌐 Live 24x7 Endpoints & Portals

- **Web Landing Page & Billing Portal**: [https://pulse-leads-mcp.onrender.com](https://pulse-leads-mcp.onrender.com)
- **Live MCP Endpoint**: `https://pulse-leads-mcp.onrender.com/mcp`
- **Merchant Wallet Vault**: `0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed` (Base EVM 8453)

---

## 🚀 Overview

PulseLeads MCP connects frontier LLM models (Claude Desktop, Cursor, LangChain, OpenAI Agents) directly to real-time high-intent B2B prospect intelligence.

- **Instant Lead Discovery**: Filter by industry (`AI`, `Fintech`, `Real Estate`, `HealthTech`, `Cybersecurity`, `SaaS`, or any custom vertical via live discovery).
- **Verified Decision Makers**: Direct C-level & VP contacts with verified email structures and live LinkedIn profiles.
- **Autonomous Monetization**: Native on-chain Base USDC settlement and `x402` EVM micropayment support with instant cryptographic key provisioning.

---

## 🛠️ MCP Tools Exposed

### `find_b2b_prospects`
Query live verified tech companies actively hiring and expanding.
```json
{
  "apiKey": "demo_free_key",
  "industry": "AI",
  "minIntentScore": 85
}
```

### `check_account_credits`
Check current active credits, tier status, and top-up links.
```json
{
  "apiKey": "your_api_key"
}
```

### `get_company_intelligence`
Retrieve detailed intelligence, decision-maker email patterns, and hiring triggers for a specific company or domain.
```json
{
  "apiKey": "demo_free_key",
  "companyOrDomain": "anthropic.com"
}
```

### `get_pricing_and_checkout`
Get live pricing tiers, checkout URLs, and Base Mainnet USDC payment details (no API key required).
```json
{
  "plan": "pro"
}
```

### `verify_usdc_payment`
Verify a Base Mainnet USDC transaction hash on-chain and receive your active API key directly inside your AI agent.
```json
{
  "txHash": "0x...",
  "plan": "pro"
}
```

### `export_leads_csv`
Export matching B2B leads with live DNS/MX deliverability status and personalized outreach hooks in CRM-ready CSV format.
```json
{
  "apiKey": "demo_free_key",
  "industry": "AI"
}
```

---

## 📦 One-Click AI Client Installation

### Via Claude Desktop (`claude_desktop_config.json`)
Connect directly to the 24/7 hosted MCP endpoint using `mcp-remote`:
```json
{
  "mcpServers": {
    "pulse-leads": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://pulse-leads-mcp.onrender.com/mcp"]
    }
  }
}
```

### Local Stdio Mode (From Source)
```bash
git clone https://github.com/kashmirsportslive/pulse-leads-mcp.git
cd pulse-leads-mcp && npm install && npm run build
node dist/index.js --stdio
```

### Remote Streamable HTTP Connection
Connect Cursor or any remote agent directly to:
```text
https://pulse-leads-mcp.onrender.com/mcp
```

---

## 💳 Transparent Pricing & Monetization

- **Free Evaluation**: 20 free queries with key `demo_free_key` or instant trial key via `/checkout?plan=trial`.
- **Starter Tier**: **$9** (500 queries) &bull; Designed for indie hackers and solo developers.
- **Pro Tier**: **$19** (1,500 queries) &bull; The standard for automated sales workflows and agents.
- **Growth Tier**: **$29** (3,000 queries) &bull; High volume intelligence at lowest per-contact cost (<$0.01/lead).
- **Settlement Merchant Vault**: `0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed` (Base Network EVM 8453).

---

## 💬 Support & Developer Help Desk

If you experience any issues with payments, key provisioning, or client configuration:

- **Primary Support Email**: [adammehfuz@gmail.com](mailto:adammehfuz@gmail.com) (Guaranteed response within 2 hours)
- **GitHub Issues**: [Open an issue on GitHub](https://github.com/kashmirsportslive/pulse-leads-mcp/issues)
- **Settlement Verification**: All on-chain receipts can be publicly verified on [BaseScan Explorer](https://basescan.org/address/0xE50451548c650cfcfb9D0E31500d51Ff3e6C88Ed).

---

## 📄 License

MIT License. Open source and ready to deploy on Render, Railway, or Fly.io.
