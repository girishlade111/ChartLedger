# Third-Party Notices & Open-Source Attributions

ChartLedger is an independently developed application. It incorporates open-source packages installed via npm under their respective licenses, and acknowledges architectural UX inspiration where applicable.

## UX Inspiration Notice
- **iOfficeAI/AionUi** (`https://github.com/iOfficeAI/AionUi`, commit `e108b6b56b1a`, Apache License 2.0):
  Audited during architecture discovery. Zero source files were copied; ChartLedger independently reimplemented web-native multi-thread conversation navigation, streaming lifecycle controls (Stop/Regenerate/Edit), and Markdown message presentation while excluding Electron, Rust `aionrs`, SQLite, local CLI execution, and MCP/ACP tools.

## Key Open-Source Dependencies
- **React & React DOM** (MIT)
- **Vite & Tailwind CSS** (MIT)
- **TradingView Lightweight Charts** (`lightweight-charts`, Apache License 2.0) — Used for interactive candlestick chart rendering.
- **technicalindicators** (MIT) — Used for deterministic OHLCV technical indicator calculations.
- **Drizzle ORM & pg** (Apache-2.0 / MIT) — PostgreSQL data access layer.
- **Express, Helmet, CORS, Multer, express-rate-limit, Zod** (MIT)
- **react-markdown & remark-gfm** (MIT)
- **lucide-react** (ISC)
- **@google/genai & firebase / firebase-admin** (Apache License 2.0)
- **stripe** (MIT)
- **bcryptjs & jsonwebtoken** (MIT)
