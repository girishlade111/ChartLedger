# 8-Stage Financial Chart Analysis Pipeline

Implemented in `src/server/ai/chartPipeline.ts`, `src/utils/indicators.ts`, and `src/utils/analysisSchema.ts`.

## Stages
1. **Chart Interpretation**: Extracts visible symbol, market category, timeframe, chart type, price scale, and image quality. Explicitly flags missing/ambiguous metadata rather than inventing values.
2. **Market Structure**: Evaluates trend regime (uptrend, downtrend, sideways), swing structure (HH/HL/LH/LL), support/resistance zones, and optional SMC framing labeled as interpretive concepts.
3. **Deterministic Technical Indicators**: Computes SMA (20/50), EMA (12/26), RSI (14), MACD (12/26/9), ATR (14), Bollinger Bands (20,2), Stochastic (14,3), ADX (14), VWAP, and Fibonacci retracement/extension via `technicalindicators` ONLY when genuine Binance OHLCV or explicitly labeled sample fixture OHLCV is present. Marks indicators `available: false` when absent.
4. **Chart Pattern Analysis**: Identifies candidate patterns with supporting evidence, required confirmation conditions, and invalidation triggers.
5. **Market Context**: Attaches Binance spot 24h quote/volume and data timestamp when symbol/timeframe match; never blends stale screenshots with live prices silently.
6. **Conditional Scenarios**: Produces balanced Bullish, Bearish, and Neutral scenarios using conditional language—zero guaranteed signals or fabricated probability percentages.
7. **Risk Analysis**: Highlights volatility, false-breakout risk, liquidity/slippage, timeframe constraints, and hypothetical R/R calculations.
8. **Result Validation & Financial Safety Gate**: Parses output against `AnalysisResultSchema` (Zod v1.0), validates price bounds (`lowerBound <= upperBound`), flags prohibited certainty/advisory phrasing, enforces mandatory non-advisory disclaimer, and permits explicit `insufficient_data` responses.

## Prompt Injection Defense
User notes, chart metadata, and retrieved knowledge-base chunks are wrapped inside untrusted data delimiters (`wrapUntrustedData`) before being passed to `gemini-4-hydrogen`.
