import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import authRoutes from './src/server/routes/authRoutes.ts';
import analysisRoutes from './src/server/routes/analysisRoutes.ts';
import chatAndRagRoutes from './src/server/routes/chatAndRagRoutes.ts';
import workspaceRoutes, { handleStripeWebhook } from './src/server/routes/workspaceRoutes.ts';
import alertsAndPortfolioRoutes from './src/server/routes/alertsAndPortfolioRoutes.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Security headers (frameguard disabled for AI Studio preview & embeddable widget routes)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Strict same-origin / allowed-origin CORS (no wildcard on authenticated APIs)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const appUrl = process.env.APP_URL;
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          (appUrl && origin === new URL(appUrl).origin) ||
          origin.endsWith('.run.app')
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: false,
    })
  );

  // Stripe webhook requires raw Buffer body before express.json()
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook
  );

  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Health & readiness endpoints
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'chartledger-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount modular API routers
  app.use(authRoutes);
  app.use(analysisRoutes);
  app.use(chatAndRagRoutes);
  app.use(workspaceRoutes);
  app.use(alertsAndPortfolioRoutes);

  // Mount Vite middleware in dev or serve built SPA in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChartLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
