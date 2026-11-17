# ⚙️ Sim Lab Operational SLA & System Readiness

This document defines the operational guarantees, latency service level objectives (SLOs), failover procedures, and incident recovery standards for the Sim Lab MCP intelligence infrastructure.

---

## ⚡ Service Level Objectives (SLOs)

| Metric | Target Objective | Production Telemetry |
| :--- | :---: | :---: |
| **Availability / Uptime** | **99.9%** | Multi-region redundant host deployment |
| **p95 Tool Call Latency** | **< 200 ms** | Fast-path cached alpha bundle pipeline |
| **p99 Tool Call Latency** | **< 500 ms** | Pre-trade evaluation & VPIN calculation |
| **Data Feed Max Age** | **< 15.0 s** | Real-time WebSocket order book listeners |
| **Fail-Closed Guarantee** | **100.0%** | Client execution guard rejects on all timeouts |

---

## 🛡️ Failover & Redundancy Architecture

* **Primary Endpoint**: `https://simlab.measmony.me/mcp/sse`
* **Health / Discovery**: `GET https://simlab.measmony.me/.well-known/x402` & `GET /x402/info`
* **Automated Canary Watchdog**: Runs continuously from independent host nodes every 60 minutes, querying fresh challenges and verifying destination address integrity (`payTo`).
* **Multi-Venue Oracle Fallback**: Real-time price and order book depth are cross-verified across Pyth Network, Decibel DEX, and Hyperliquid. If any single provider drops, secondary feeds seamlessly take over.

---

## 🔄 Versioning & Backward Compatibility

* **Semantic Versioning**: Sim Lab adheres to SemVer 2.0. Breaking schema changes will increment the major version and will be announced with a minimum 30-day deprecation notice.
* **MCP Specification Compatibility**: Protocol version `2025-07-09` over Server-Sent Events (SSE) and JSON-RPC 2.0.

---

## 🚨 Incident Response & Status Reporting

* **Status Page & Proof Feed**: Real-time status and regime event flips are streamed live at `https://simlab.measmony.me/commons/feed.json`.
* **Incident Escalation**:
  * **Email**: `alpha@measmony.me`
  * **Telegram Emergency Dispatch**: `@measmonysuon`
