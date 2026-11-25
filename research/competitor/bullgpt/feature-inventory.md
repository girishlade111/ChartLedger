# BullGPT Public Capability Inventory

**Research Scope**: Permitted public web pages only (`https://www.bullgpt.io/`). No authentication bypass, no scraping of protected routes, no asset copying, and no prompt extraction.

## Evidence Classification Legend
- `VERIFIED_PUBLIC`: Explicitly observed via permitted public web search/indexing.
- `UNVERIFIED`: Not publicly verifiable without authenticated access or independent third-party audit.

## Feature Inventory

| Capability Area | Publicly Documented Behavior | Classification | ChartLedger Independent Approach |
|---|---|---|---|
| Chart Screenshot Upload | Instant screenshot upload and chart reading workflow | `VERIFIED_PUBLIC` | Drag/drop, file browser, clipboard paste (`Ctrl+V`), magic-byte + dimension validation, private storage, 8-stage vision pipeline |
| Technical Confluence | Mentions S/R, SMC, RSI, Fibonacci, trend structure | `VERIFIED_PUBLIC` | Deterministic OHLCV indicators via `technicalindicators` (SMA, EMA, RSI, MACD, ATR, BB, Stoch, ADX, VWAP, Fibonacci) + transparent visibility labels when OHLCV is unavailable |
| Market / Macro Context | Mentions macro sentiment and market context | `VERIFIED_PUBLIC` | Binance public spot market data integration for supported crypto symbols with timestamps/attribution; explicit unavailable notices for unsupported feeds |
| Risk & Scenario Framing | Mentions prop-firm style risk positioning and scenarios | `VERIFIED_PUBLIC` | Bullish, Bearish, and Neutral conditional scenarios + hypothetical R/R calculator; strict non-advisory guardrails and zero guaranteed signals |
| Compliance & Disclaimer | Non-advisory disclaimer under Veutino LLC | `VERIFIED_PUBLIC` | Prominent non-advisory financial disclaimer on landing, workspace, exports, shares, and dedicated Risk Disclosure & Financial Disclaimer pages |
| Authenticated App Internals | Private dashboard screens, prompt engineering, internal model stack | `UNVERIFIED` | Independently architected 20-table PostgreSQL + pgvector SaaS with Gemini 4 Hydrogen, Gemini Embedding 2, SSE chat, and versioned prompt registry |
| Subscription Pricing & Quotas | Exact tier pricing and usage caps | `UNVERIFIED` | Configurable DB-backed Free ($0, 15 analyses/mo) and Pro ($29/mo, 200 analyses/mo) plans editable in PostgreSQL |
| Performance / Win-Rate Claims | Any claimed trading profitability or win rate | `UNVERIFIED` | Explicitly forbidden in ChartLedger; zero fabricated testimonials, win rates, or user counts |
