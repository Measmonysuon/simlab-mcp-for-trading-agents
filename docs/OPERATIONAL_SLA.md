# ⚙️ Sim Lab Operational SLOs & Measured Telemetry

This document defines the service level objectives (SLOs), latency benchmarks, failover architecture, and monitoring telemetry for the Sim Lab MCP intelligence infrastructure.

---

## ⚡ Service Level Objectives (SLOs) & Measured Benchmarks

| Metric | Target Objective | Measurement Mechanism |
| :--- | :---: | :--- |
| **Availability / Uptime** | **99.9%** | Multi-region redundant deployment; verified by hourly canary watchdog. |
| **p95 Tool Call Latency** | **< 200 ms** | Fast-path cached alpha bundle pipeline (`/api/pipeline/alpha-bundle`). |
| **p99 Tool Call Latency** | **< 500 ms** | Microstructure toxicity & VPIN calculation pipeline. |
| **Data Feed Max Age** | **< 15.0 s** | Real-time WebSocket order book listeners; client guard aborts if $>15\text{s}$. |
| **Fail-Closed Guarantee** | **100.0%** | Client execution guard rejects orders on timeouts, disconnects, or errors. |

---

## 🛡️ Telemetry & Live Verification

* **Primary Endpoint**: `https://simlab.measmony.me/mcp/sse`
* **Live Discovery & Telemetry Feed**: `GET https://simlab.measmony.me/commons/feed.json`
* **Hourly Canary Watchdog**: An automated watchdog runs hourly from independent host tasks, querying live discovery documents from both `simlab.measmony.me` and `alpha.measmony.me` to assert server responsiveness and verify payment destination integrity (`payTo`).
* **Multi-Venue Oracle Fallback**: Real-time price and order book depth are cross-verified across Pyth Network, Decibel DEX, and Hyperliquid. If any single provider drops, secondary feeds seamlessly take over.

---

## 🔄 Versioning & Backward Compatibility

* **Semantic Versioning**: Sim Lab adheres to SemVer 2.0. Breaking schema changes will increment the major version and will be announced with a minimum 30-day deprecation notice.
* **MCP Specification Compatibility**: Protocol version `2025-07-09` over Server-Sent Events (SSE) and JSON-RPC 2.0.

---

## 🚨 Incident Escalation & Support

* **Status & Regime Stream**: `https://simlab.measmony.me/commons/feed.json`
* **Direct Escalation**:
  * **Email**: `alpha@measmony.me`
  * **Telegram**: `@measmonysuon`
