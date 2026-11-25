# Pre-Launch Compliance & Legal Checklist

Before deploying ChartLedger to public users or enabling live billing:

- [ ] **Financial Regulatory Review**: Have qualified securities/financial counsel review all UI copy, disclaimers, Terms of Service, Risk Disclosure, and AI prompt templates in target jurisdictions (e.g., SEC/CFTC, FCA, ESMA, SEBI).
- [ ] **Non-Advisory Guardrails Audit**: Periodically test AI outputs against adversarial prompts to confirm zero personalized investment advice, guaranteed return claims, or brokerage execution instructions.
- [ ] **Stripe Production Readiness**: Configure live Stripe business profile, tax/VAT collection (Stripe Tax), webhook signing secrets, and billing portal policies only after explicit approval.
- [ ] **Market Data Commercial Licensing**: Binance public spot endpoints are intended for public/educational crypto data; obtain commercial redistribution licenses (e.g., Twelve Data, Polygon/Massive, ICE) before offering real-time stocks, indices, or FX feeds to paying subscribers.
- [ ] **Privacy & Data Retention**: Configure automated retention schedules for uploaded charts, chat transcripts, and audit logs; verify GDPR/CCPA data export (`/api/user/export`) and deletion (`/api/user/account`) workflows.
- [ ] **Private Object Storage**: Migrate local `.data/uploads` disk storage to encrypted Cloud Storage / S3 with short-lived signed URLs for multi-replica production deployments.
