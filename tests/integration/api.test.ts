import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:3000';

// Minimal valid 1x1 PNG (68 bytes) with genuine PNG magic bytes + IHDR dimensions
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360f8cf000000040001c7d85e7f0000000049454e44ae426082',
  'hex'
);

// Helper to create a valid 64x64 PNG header (magic bytes + valid IHDR 64x64)
function buildPngWithSize(width: number, height: number): Buffer {
  const buf = Buffer.from(VALID_1X1_PNG);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

async function reqJson(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

test('Full-stack API, Security, Tenant Isolation, RAG, SSE & Billing Integration Suite', async (t) => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const emailA = `int_a_${suffix}@chartledger.test`;
  const emailB = `int_b_${suffix}@chartledger.test`;
  const password = 'TestPassword!2026';

  let tokenA = '';
  let tokenB = '';
  let uploadIdA = '';
  let analysisIdA = '';
  let shareTokenA = '';
  let shareIdA = '';
  let conversationIdA = '';
  let collectionIdA = '';

  t.after(async () => {
    // Clean up both temporary test accounts so PostgreSQL stays spotless
    if (tokenA) {
      await reqJson('/api/user/account', { method: 'DELETE', token: tokenA }).catch(() => {});
    }
    if (tokenB) {
      await reqJson('/api/user/account', { method: 'DELETE', token: tokenB }).catch(() => {});
    }
  });

  await t.test('1. Health endpoint and public demo fixture respond accurately', async () => {
    const health = await reqJson('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');

    const demo = await reqJson('/api/public/demo/btc_uptrend');
    assert.equal(demo.status, 200);
    assert.equal(demo.data.isDemoFixture, true);
    assert.equal(demo.data.analysis.schemaVersion, '1.0');
    assert.ok(Array.isArray(demo.data.marketData.candles) && demo.data.marketData.candles.length >= 60);
  });

  await t.test('2. Unauthenticated requests to protected routes return 401', async () => {
    const res1 = await reqJson('/api/analyses');
    assert.equal(res1.status, 401);
    const res2 = await reqJson('/api/knowledge/documents');
    assert.equal(res2.status, 401);
    const res3 = await reqJson('/api/admin/overview');
    assert.equal(res3.status, 401);
  });

  await t.test('3. Register User A & User B, verify anti-enumeration & RBAC 403', async () => {
    const regA = await reqJson('/api/auth/register', {
      method: 'POST',
      body: { email: emailA, password, displayName: 'Analyst A', acceptedTerms: true },
    });
    assert.equal(regA.status, 201, `Expected 201 register A, got ${regA.status}: ${JSON.stringify(regA.data)}`);
    assert.ok(regA.data.token);
    tokenA = regA.data.token;

    const regB = await reqJson('/api/auth/register', {
      method: 'POST',
      body: { email: emailB, password, displayName: 'Analyst B', acceptedTerms: true },
    });
    assert.equal(regB.status, 201);
    tokenB = regB.data.token;

    // Non-admin cannot access admin console
    const adminRes = await reqJson('/api/admin/overview', { token: tokenA });
    assert.equal(adminRes.status, 403);

    // Forgot password returns generic 200 for nonexistent email (no enumeration)
    const fpRes = await reqJson('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nonexistent_user_9999@chartledger.test' },
    });
    assert.equal(fpRes.status, 200);
  });

  await t.test('4. Reject spoofed/invalid PNG upload and accept valid PNG upload', async () => {
    // Spoofed executable/SVG masquerading as PNG
    const badForm = new FormData();
    badForm.append(
      'file',
      new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }),
      'evil.png'
    );
    const badRes = await reqJson('/api/uploads', { method: 'POST', token: tokenA, body: badForm });
    assert.equal(badRes.status, 400);

    // Valid PNG (120x120)
    const goodPng = buildPngWithSize(120, 120);
    const goodForm = new FormData();
    goodForm.append('file', new Blob([new Uint8Array(goodPng)], { type: 'image/png' }), 'btc-chart.png');
    const goodRes = await reqJson('/api/uploads', { method: 'POST', token: tokenA, body: goodForm });
    assert.equal(goodRes.status, 201, `Upload failed: ${JSON.stringify(goodRes.data)}`);
    assert.ok(goodRes.data.id);
    uploadIdA = goodRes.data.id;

    // Tenant isolation on upload image download: User B gets 404/403
    const leakImg = await fetch(`${BASE}/api/uploads/${uploadIdA}/image`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(leakImg.status === 404 || leakImg.status === 403, `Expected 404/403, got ${leakImg.status}`);
  });

  await t.test('5. Create structured analysis (fixture mode), persist, share, and verify tenant isolation', async () => {
    const createRes = await reqJson('/api/analyses', {
      method: 'POST',
      token: tokenA,
      body: {
        uploadId: uploadIdA,
        symbol: 'BTC/USDT',
        market: 'Crypto',
        timeframe: '4H',
        useMockProvider: true,
        sampleScenario: 'btc_uptrend',
        notes: 'Integration test scenario',
      },
    });
    assert.equal(createRes.status, 201, `Analysis failed: ${JSON.stringify(createRes.data)}`);
    assert.equal(createRes.data.analysis.resultJson.schemaVersion, '1.0');
    assert.ok(createRes.data.analysis.resultJson.disclaimer.length > 20);
    analysisIdA = createRes.data.analysis.id;

    // User A can fetch it
    const getA = await reqJson(`/api/analyses/${analysisIdA}`, { token: tokenA });
    assert.equal(getA.status, 200);
    assert.equal(getA.data.analysis.id, analysisIdA);

    // User B CANNOT read or delete User A's analysis
    const getB = await reqJson(`/api/analyses/${analysisIdA}`, { token: tokenB });
    assert.equal(getB.status, 404);
    const delB = await reqJson(`/api/analyses/${analysisIdA}`, { method: 'DELETE', token: tokenB });
    assert.equal(delB.status, 404);

    // Shareable link excludes image by default and works publicly until revoked
    const shareRes = await reqJson(`/api/analyses/${analysisIdA}/share`, {
      method: 'POST',
      token: tokenA,
      body: { includeImage: false, expiresInDays: 7 },
    });
    assert.equal(shareRes.status, 201);
    shareTokenA = shareRes.data.share.shareToken;
    shareIdA = shareRes.data.share.id;

    const pubShare = await reqJson(`/api/public/shares/${shareTokenA}`);
    assert.equal(pubShare.status, 200);
    assert.equal(pubShare.data.imageUrl, null);
    assert.equal(pubShare.data.userId, undefined);

    // Revoke share
    const revRes = await reqJson(`/api/shares/${shareIdA}`, { method: 'DELETE', token: tokenA });
    assert.equal(revRes.status, 200);
    const afterRev = await reqJson(`/api/public/shares/${shareTokenA}`);
    assert.equal(afterRev.status, 404);
  });

  await t.test('6. Knowledge Base (RAG) ingestion & strict cross-tenant isolation', async () => {
    const colRes = await reqJson('/api/knowledge/collections', {
      method: 'POST',
      token: tokenA,
      body: { name: 'Secret Risk Playbook', description: 'Private test collection' },
    });
    assert.equal(colRes.status, 201);
    collectionIdA = colRes.data.collection.id;

    const uniquePhrase = `alpha_zeta_playbook_${suffix}`;
    const docRes = await reqJson('/api/knowledge/documents', {
      method: 'POST',
      token: tokenA,
      body: {
        collectionId: collectionIdA,
        title: 'Momentum Risk Rules.md',
        content: `When trading breakouts under ${uniquePhrase}, always define invalidation below the prior swing low and check ATR volatility expansion.`,
      },
    });
    assert.equal(docRes.status, 201, `Doc ingest failed: ${JSON.stringify(docRes.data)}`);
    assert.ok(docRes.data.document.chunkCount >= 1);

    // User A retrieves their document
    const searchA = await reqJson('/api/knowledge/search', {
      method: 'POST',
      token: tokenA,
      body: { query: uniquePhrase, topK: 5 },
    });
    assert.equal(searchA.status, 200);
    assert.ok(searchA.data.results.length >= 1, 'User A should find own chunk');
    assert.ok(searchA.data.results[0].content.includes(uniquePhrase));

    // User B MUST receive 0 results for User A's unique phrase
    const searchB = await reqJson('/api/knowledge/search', {
      method: 'POST',
      token: tokenB,
      body: { query: uniquePhrase, topK: 5 },
    });
    assert.equal(searchB.status, 200);
    assert.equal(searchB.data.results.length, 0, 'Cross-tenant RAG leak detected!');
  });

  await t.test('7. Streaming SSE Research Chat with attached analysis & RAG context', async () => {
    const convRes = await reqJson('/api/conversations', {
      method: 'POST',
      token: tokenA,
      body: { title: 'BTC Structure Follow-Up', analysisId: analysisIdA },
    });
    assert.equal(convRes.status, 201);
    conversationIdA = convRes.data.conversation.id;

    const streamRes = await fetch(`${BASE}/api/conversations/${conversationIdA}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: 'Summarize the key risk factors and invalidation conditions.',
        useKnowledgeBase: true,
        useMockProvider: true,
      }),
    });
    assert.equal(streamRes.status, 200);
    assert.ok(streamRes.headers.get('content-type')?.includes('text/event-stream'));
    const sseText = await streamRes.text();
    assert.ok(sseText.includes('event: delta'), 'Expected SSE delta events');
    assert.ok(sseText.includes('event: done'), 'Expected SSE done event');

    // Verify conversation persisted in PostgreSQL
    const convGet = await reqJson(`/api/conversations/${conversationIdA}`, { token: tokenA });
    assert.equal(convGet.status, 200);
    assert.ok(convGet.data.messages.length >= 2);
  });

  await t.test('8. Stripe forged webhook rejected & local test-mode entitlement upgrade/downgrade works', async () => {
    // Forged raw webhook to /api/webhooks/stripe must be rejected (400 or 503 when unconfigured)
    const forged = await fetch(`${BASE}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=12345,v1=forgedsignature',
      },
      body: JSON.stringify({ id: 'evt_forged', type: 'checkout.session.completed' }),
    });
    assert.ok(forged.status === 400 || forged.status === 503, `Expected 400/503, got ${forged.status}`);

    // Upgrade via explicitly labeled local test-mode simulator
    const up = await reqJson('/api/billing/simulate-test-webhook', {
      method: 'POST',
      token: tokenA,
      body: { action: 'upgrade_pro' },
    });
    assert.equal(up.status, 200, `Sim upgrade failed: ${JSON.stringify(up.data)}`);

    const subPro = await reqJson('/api/billing/subscription', { token: tokenA });
    assert.equal(subPro.status, 200);
    assert.equal(subPro.data.plan.id, 'pro');

    // Downgrade back to free
    const down = await reqJson('/api/billing/simulate-test-webhook', {
      method: 'POST',
      token: tokenA,
      body: { action: 'downgrade_free' },
    });
    assert.equal(down.status, 200);

    const subFree = await reqJson('/api/billing/subscription', { token: tokenA });
    assert.equal(subFree.status, 200);
    assert.equal(subFree.data.plan.id, 'free');
  });

  await t.test('9. User data export returns tenant records only', async () => {
    const exp = await reqJson('/api/user/export', { token: tokenA });
    assert.equal(exp.status, 200);
    assert.equal(exp.data.account.email, emailA);
    assert.ok(Array.isArray(exp.data.analyses) && exp.data.analyses.length >= 1);
  });

  await t.test('10. Real-time price alerts create, evaluate against live spot price, and enforce tenant isolation', async () => {
    // Create an alert guaranteed to trigger immediately (BTCUSDT above $1)
    const triggeredCreate = await reqJson('/api/alerts', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'BTCUSDT', market: 'Crypto', condition: 'above', targetPrice: 1, note: 'Spot trigger test' },
    });
    assert.equal(triggeredCreate.status, 201, `Create alert failed: ${JSON.stringify(triggeredCreate.data)}`);
    assert.equal(triggeredCreate.data.alert.status, 'triggered');
    assert.ok(triggeredCreate.data.alert.triggeredPrice > 1);
    const alertIdA = triggeredCreate.data.alert.id;

    // Create an active non-triggered alert (BTCUSDT above $9,000,000)
    const activeCreate = await reqJson('/api/alerts', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'BTCUSDT', market: 'Crypto', condition: 'above', targetPrice: 9000000 },
    });
    assert.equal(activeCreate.status, 201);
    assert.equal(activeCreate.data.alert.status, 'active');

    // User B cannot update or delete User A's alert
    const patchB = await reqJson(`/api/alerts/${alertIdA}`, {
      method: 'PATCH',
      token: tokenB,
      body: { status: 'paused' },
    });
    assert.equal(patchB.status, 404);
    const delB = await reqJson(`/api/alerts/${alertIdA}`, { method: 'DELETE', token: tokenB });
    assert.equal(delB.status, 404);

    // User A can pause and evaluate live alerts
    const evalRes = await reqJson('/api/alerts/evaluate', { method: 'POST', token: tokenA });
    assert.equal(evalRes.status, 200);
    assert.ok(Array.isArray(evalRes.data.alerts) && evalRes.data.alerts.length === 2);

    const delA = await reqJson(`/api/alerts/${alertIdA}`, { method: 'DELETE', token: tokenA });
    assert.equal(delA.status, 200);
  });

  await t.test('11. Portfolio holdings CRUD, real-time summary, historical performance curve, and tenant isolation', async () => {
    const addBtc = await reqJson('/api/portfolio/holdings', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'BTCUSDT', market: 'Crypto', quantity: 0.5, avgCost: 50000, notes: 'Core position' },
    });
    assert.equal(addBtc.status, 201, `Create holding failed: ${JSON.stringify(addBtc.data)}`);
    const holdingIdA = addBtc.data.holding.id;

    const addEth = await reqJson('/api/portfolio/holdings', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'ETHUSDT', market: 'Crypto', quantity: 4, avgCost: 2200 },
    });
    assert.equal(addEth.status, 201);

    const summaryRes = await reqJson('/api/portfolio/summary?range=30', { token: tokenA });
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.data.summary.holdingCount, 2);
    assert.ok(summaryRes.data.summary.totalCurrentValue > 0);
    assert.ok(summaryRes.data.performance.points.length >= 10);

    // User B cannot see, update, or delete User A's holdings
    const summaryB = await reqJson('/api/portfolio/summary?range=30', { token: tokenB });
    assert.equal(summaryB.status, 200);
    assert.equal(summaryB.data.summary.holdingCount, 0);

    const patchB = await reqJson(`/api/portfolio/holdings/${holdingIdA}`, {
      method: 'PATCH',
      token: tokenB,
      body: { quantity: 99 },
    });
    assert.equal(patchB.status, 404);

    // User A updates quantity and deletes
    const patchA = await reqJson(`/api/portfolio/holdings/${holdingIdA}`, {
      method: 'PATCH',
      token: tokenA,
      body: { quantity: 0.75 },
    });
    assert.equal(patchA.status, 200);
    assert.equal(patchA.data.holding.quantity, 0.75);

    const delA = await reqJson(`/api/portfolio/holdings/${holdingIdA}`, {
      method: 'DELETE',
      token: tokenA,
    });
    assert.equal(delA.status, 200);
  });

  await t.test('12. Alert History logs triggered alerts persistently, updates outcomes, and enforces tenant isolation', async () => {
    // Subtest 10 already triggered and deleted a BTCUSDT alert for User A — verify history persisted!
    const histRes = await reqJson('/api/alerts/history?fresh=1', { token: tokenA });
    assert.equal(histRes.status, 200, `Alert history fetch failed: ${JSON.stringify(histRes.data)}`);
    assert.ok(Array.isArray(histRes.data.history) && histRes.data.history.length >= 1);
    const entry = histRes.data.history[0];
    assert.equal(entry.symbol, 'BTCUSDT');
    assert.equal(entry.outcomeStatus, 'pending_review');
    assert.ok(entry.metrics && typeof entry.metrics.breachDeltaAmount === 'number');

    // User B cannot see, update, or delete User A's alert history
    const histB = await reqJson('/api/alerts/history', { token: tokenB });
    assert.equal(histB.status, 200);
    assert.equal(histB.data.history.length, 0);

    const patchB = await reqJson(`/api/alerts/history/${entry.id}`, {
      method: 'PATCH',
      token: tokenB,
      body: { outcomeStatus: 'actioned', outcomeNote: 'Cross-tenant attempt' },
    });
    assert.equal(patchB.status, 404);

    const delB = await reqJson(`/api/alerts/history/${entry.id}`, {
      method: 'DELETE',
      token: tokenB,
    });
    assert.equal(delB.status, 404);

    // User A updates outcome status & note
    const patchA = await reqJson(`/api/alerts/history/${entry.id}`, {
      method: 'PATCH',
      token: tokenA,
      body: { outcomeStatus: 'actioned', outcomeNote: 'Executed scale-in on retest' },
    });
    assert.equal(patchA.status, 200);
    assert.equal(patchA.data.entry.outcomeStatus, 'actioned');
    assert.equal(patchA.data.entry.outcomeNote, 'Executed scale-in on retest');

    // Delete history entry cleanly
    const delA = await reqJson(`/api/alerts/history/${entry.id}`, {
      method: 'DELETE',
      token: tokenA,
    });
    assert.equal(delA.status, 200);
  });

  await t.test('13. Portfolio PDF report export requires auth and returns a valid binary PDF document', async () => {
    const unauthPdf = await fetch(`${BASE}/api/portfolio/export/pdf?range=30`);
    assert.equal(unauthPdf.status, 401);

    const pdfRes = await fetch(`${BASE}/api/portfolio/export/pdf?range=30`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(pdfRes.status, 200);
    assert.ok((pdfRes.headers.get('content-type') || '').includes('application/pdf'));
    assert.ok((pdfRes.headers.get('content-disposition') || '').includes('.pdf'));

    const buf = Buffer.from(await pdfRes.arrayBuffer());
    assert.ok(buf.length > 1200, `Expected PDF > 1200 bytes, got ${buf.length}`);
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  await t.test('14. Notification Settings toggle persists and governs triggered alert email dispatches per tenant', async () => {
    const initial = await reqJson('/api/notifications/settings', { token: tokenA });
    assert.equal(initial.status, 200);
    assert.equal(initial.data.settings.emailAlertsEnabled, false);

    // Enable email notifications with custom recipient email
    const enableRes = await reqJson('/api/notifications/settings', {
      method: 'PATCH',
      token: tokenA,
      body: {
        emailAlertsEnabled: true,
        recipientEmail: 'alerts-desk@chartledger.test',
        includeResearchNotes: true,
        deliveryMode: 'instant',
      },
    });
    assert.equal(enableRes.status, 200);
    assert.equal(enableRes.data.settings.emailAlertsEnabled, true);
    assert.equal(enableRes.data.settings.recipientEmail, 'alerts-desk@chartledger.test');

    // Trigger an alert immediately — should record an email notification dispatch for User A
    const trigAlert = await reqJson('/api/alerts', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'BTCUSDT', market: 'Crypto', condition: 'above', targetPrice: 1, note: 'Email notify test' },
    });
    assert.equal(trigAlert.status, 201);
    assert.equal(trigAlert.data.triggeredImmediately, true);

    const afterEnable = await reqJson('/api/notifications/settings', { token: tokenA });
    assert.equal(afterEnable.status, 200);
    assert.ok(afterEnable.data.recentDispatches.length >= 1);
    assert.equal(afterEnable.data.recentDispatches[0].recipientEmail, 'alerts-desk@chartledger.test');

    // User B does not see User A's settings or dispatches
    const settingsB = await reqJson('/api/notifications/settings', { token: tokenB });
    assert.equal(settingsB.status, 200);
    assert.equal(settingsB.data.settings.emailAlertsEnabled, false);
    assert.equal(settingsB.data.recentDispatches.length, 0);

    // Disable email notifications and verify count does not increase on next trigger
    const prevCount = afterEnable.data.recentDispatches.length;
    const disableRes = await reqJson('/api/notifications/settings', {
      method: 'PATCH',
      token: tokenA,
      body: { emailAlertsEnabled: false },
    });
    assert.equal(disableRes.status, 200);
    assert.equal(disableRes.data.settings.emailAlertsEnabled, false);

    await reqJson('/api/alerts', {
      method: 'POST',
      token: tokenA,
      body: { symbol: 'ETHUSDT', market: 'Crypto', condition: 'above', targetPrice: 1 },
    });
    const afterDisable = await reqJson('/api/notifications/settings', { token: tokenA });
    assert.equal(afterDisable.data.recentDispatches.length, prevCount);
  });

  await t.test('15. Portfolio Market Sentiment computes live bullish/bearish indicator scores for active holdings', async () => {
    const sentA = await reqJson('/api/portfolio/sentiment?timeframe=4h', { token: tokenA });
    assert.equal(sentA.status, 200, `Sentiment failed: ${JSON.stringify(sentA.data)}`);
    assert.ok(sentA.data.sentiment.totalHoldingsCount >= 1);
    assert.ok(sentA.data.sentiment.scoredHoldingsCount >= 1);
    assert.ok(
      typeof sentA.data.sentiment.overallScore === 'number' &&
        sentA.data.sentiment.overallScore >= 0 &&
        sentA.data.sentiment.overallScore <= 100
    );
    assert.ok(sentA.data.sentiment.assets[0].signals.length >= 4);

    // User B has 0 holdings -> isolated empty sentiment
    const sentB = await reqJson('/api/portfolio/sentiment?timeframe=4h', { token: tokenB });
    assert.equal(sentB.status, 200);
    assert.equal(sentB.data.sentiment.totalHoldingsCount, 0);
    assert.equal(sentB.data.sentiment.overallScore, null);
  });
});



