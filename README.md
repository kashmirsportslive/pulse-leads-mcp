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
