# ⚡ PulseLeads MCP Server

[![Glama MCP](https://glama.ai/mcp/servers/kashmirsportslive/pulse-leads-mcp/badge)](https://glama.ai/mcp/servers/kashmirsportslive/pulse-leads-mcp)
[![Live Cloud Endpoint](https://img.shields.io/badge/Render-24%2F7%20Online-22c55e)](https://pulse-leads-mcp.onrender.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Autonomous High-Intent B2B Prospect Intelligence for AI Agents, Developers, and Sales Teams. Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

---

## 🌐 Live 24x7 Endpoints & Portals

- **Web Landing Page & Billing Portal**: [https://pulse-leads-mcp.onrender.com](https://pulse-leads-mcp.onrender.com)
- **Live MCP Endpoint**: `https://pulse-leads-mcp.onrender.com/mcp`
- **Merchant Wallet Vault**: `0xacec998f35d926adBD66c60B46cE0AdCd13145bA` (Base EVM 8453)

---

## 🚀 Overview

PulseLeads MCP connects frontier LLM models (Claude Desktop, Cursor, LangChain, OpenAI Agents) directly to real-time high-intent B2B prospect intelligence.

- **Instant Lead Discovery**: Filter by industry (`AI`, `Fintech`, `HealthTech`, `Cybersecurity`, `Logistics`).
- **Verified Decision Makers**: Direct C-level & VP contacts with verified email structures and live LinkedIn profiles.
- **Autonomous Monetization**: Built-in Stripe subscription checkout and native `x402` EVM USDC micropayments.

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

---

## 📦 One-Click AI Client Installation

### Via Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "pulse-leads": {
      "command": "npx",
      "args": ["-y", "pulse-leads-mcp"]
    }
  }
}
```

### Remote SSE / HTTP Stream Connection
Connect Cursor or any remote agent directly to:
```text
https://pulse-leads-mcp.onrender.com/mcp
```

---

## 💳 Payment & Monetization Protocol

- **Free Evaluation**: 3 trial queries with key `demo_free_key`.
- **Pro Tier**: $29/mo (1,000 queries) via Base USDC / Stripe.
- **Pay-As-You-Go**: $0.10 / resolved contact via Base EVM 8453.
- **Merchant Vault Settlement**: `0xacec998f35d926adBD66c60B46cE0AdCd13145bA`.

---

## 📄 License

MIT License. Open source and ready to deploy on Render, Railway, or Fly.io.
