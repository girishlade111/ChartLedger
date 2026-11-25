import PDFDocument from 'pdfkit';
import type {
  PortfolioPerformanceSeries,
  PortfolioSummary,
} from '../utils/portfolioAndAlerts.ts';

export interface PortfolioPdfReportInput {
  ownerName: string;
  ownerEmail: string;
  rangeDays: number;
  generatedAt: string;
  summary: PortfolioSummary;
  performance: PortfolioPerformanceSeries;
}

function formatUsd(val: number): string {
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedUsd(val: number): string {
  if (val > 0) return `+${formatUsd(val)}`;
  return formatUsd(val);
}

function formatPrice(val: number): string {
  if (val >= 1000) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (val >= 1) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
}

function formatShortDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export async function generatePortfolioPdfBuffer(
  input: PortfolioPdfReportInput
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 44, bottom: 48, left: 44, right: 44 },
        bufferPages: true,
        info: {
          Title: `ChartLedger Asset Holdings & Performance Report (${input.rangeDays}D)`,
          Author: 'ChartLedger Research Workspace',
          Subject: 'User Asset Holdings and Portfolio Performance Summary',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;
      const darkInk = '#09090B';
      const mutedInk = '#52525B';
      const borderCol = '#E4E4E7';
      const cardBg = '#F4F4F5';
      const emerald = '#059669';
      const red = '#DC2626';

      // ====================================================================
      // 1. HEADER BAND
      // ====================================================================
      doc.rect(leftX, 36, pageWidth, 62).fill('#09090B');
      doc
        .fillColor('#FAFAFA')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text('ChartLedger', leftX + 16, 48, { continued: true })
        .font('Helvetica')
        .fillColor('#10B981')
        .text('  |  Asset Holdings & Performance Report');

      doc
        .fillColor('#A1A1AA')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          `Prepared for: ${input.ownerName} (${input.ownerEmail})   ·   Timeframe: ${input.rangeDays}D   ·   Generated: ${new Date(
            input.generatedAt
          ).toUTCString()}`,
          leftX + 16,
          72,
          { width: pageWidth - 32 }
        );

      // ====================================================================
      // 2. EXECUTIVE KPI SUMMARY STRIP
      // ====================================================================
      let cursorY = 114;
      const gap = 10;
      const cardW = (pageWidth - gap * 3) / 4;
      const cardH = 62;

      const { summary, performance } = input;
      const pnlPos = summary.totalUnrealizedPnl >= 0;
      const periodPos = performance.periodChangeValue >= 0;

      const kpis = [
        {
          label: 'TOTAL MARKET VALUE',
          value: formatUsd(summary.totalCurrentValue),
          sub: `${summary.liveCoverageCount}/${summary.holdingCount} live spot feeds`,
          valColor: darkInk,
        },
        {
          label: 'TOTAL COST BASIS',
          value: formatUsd(summary.totalCostBasis),
          sub: `${summary.holdingCount} ${summary.holdingCount === 1 ? 'position' : 'positions'} tracked`,
          valColor: darkInk,
        },
        {
          label: 'UNREALIZED P&L',
          value: formatSignedUsd(summary.totalUnrealizedPnl),
          sub: `${pnlPos ? '+' : ''}${summary.totalUnrealizedPnlPercent}% vs cost basis`,
          valColor: pnlPos ? emerald : red,
        },
        {
          label: `${input.rangeDays}D PORTFOLIO CHANGE`,
          value: `${periodPos ? '+' : ''}${performance.periodChangePercent}%`,
          sub: `${formatSignedUsd(performance.periodChangeValue)}${
            summary.weightedChange24hPercent != null
              ? ` · 24h ${summary.weightedChange24hPercent > 0 ? '+' : ''}${summary.weightedChange24hPercent}%`
              : ''
          }`,
          valColor: periodPos ? emerald : red,
        },
      ];

      kpis.forEach((kpi, idx) => {
        const x = leftX + idx * (cardW + gap);
        doc.roundedRect(x, cursorY, cardW, cardH, 5).fillAndStroke(cardBg, borderCol);
        doc
          .fillColor(mutedInk)
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(kpi.label, x + 9, cursorY + 9, { width: cardW - 18 });
        doc
          .fillColor(kpi.valColor)
          .font('Helvetica-Bold')
          .fontSize(12.5)
          .text(kpi.value, x + 9, cursorY + 23, { width: cardW - 18 });
        doc
          .fillColor(mutedInk)
          .font('Helvetica')
          .fontSize(7.5)
          .text(kpi.sub, x + 9, cursorY + 44, { width: cardW - 18 });
      });

      cursorY += cardH + 18;

      // ====================================================================
      // 3. HISTORICAL VALUATION CURVE (VECTOR CHART)
      // ====================================================================
      doc
        .fillColor(darkInk)
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(`Portfolio Valuation Curve (${input.rangeDays}D Historical Market Value)`, leftX, cursorY);

      doc
        .fillColor(mutedInk)
        .font('Helvetica')
        .fontSize(8)
        .text(
          performance.costBasisFallbackAssets > 0
            ? `Source: Binance Public Spot History (${performance.costBasisFallbackAssets} non-spot asset(s) valued at cost basis)`
            : 'Source: Binance Public Spot Historical OHLCV',
          leftX,
          cursorY + 14
        );

      cursorY += 30;
      const chartBoxH = 155;
      doc.roundedRect(leftX, cursorY, pageWidth, chartBoxH, 5).fillAndStroke('#FFFFFF', borderCol);

      const points = performance.points;
      if (points.length >= 2) {
        const padL = 56;
        const padR = 16;
        const padT = 16;
        const padB = 26;
        const plotX = leftX + padL;
        const plotY = cursorY + padT;
        const plotW = pageWidth - padL - padR;
        const plotH = chartBoxH - padT - padB;

        const allVals = points.map((p) => p.value);
        if (summary.totalCostBasis > 0) allVals.push(summary.totalCostBasis);
        const rawMin = Math.min(...allVals);
        const rawMax = Math.max(...allVals);
        const span = rawMax - rawMin || Math.max(1, rawMax * 0.1);
        const minVal = Math.max(0, rawMin - span * 0.08);
        const maxVal = rawMax + span * 0.08;
        const valSpan = maxVal - minVal || 1;

        const xForIdx = (i: number) => plotX + (i / (points.length - 1)) * plotW;
        const yForVal = (v: number) => plotY + plotH - ((v - minVal) / valSpan) * plotH;

        // Horizontal gridlines & Y-axis labels
        const gridTicks = 4;
        for (let t = 0; t <= gridTicks; t++) {
          const ratio = t / gridTicks;
          const y = plotY + plotH - ratio * plotH;
          const tickVal = minVal + ratio * valSpan;
          doc
            .save()
            .strokeColor('#F4F4F5')
            .lineWidth(0.75)
            .moveTo(plotX, y)
            .lineTo(plotX + plotW, y)
            .stroke()
            .restore();
          doc
            .fillColor(mutedInk)
            .font('Helvetica')
            .fontSize(7)
            .text(formatUsd(tickVal), leftX + 4, y - 4, { width: padL - 10, align: 'right' });
        }

        // Cost Basis dashed reference line
        if (summary.totalCostBasis > 0) {
          const cbY = yForVal(summary.totalCostBasis);
          doc
            .save()
            .strokeColor('#71717A')
            .lineWidth(0.85)
            .dash(3, { space: 3 })
            .moveTo(plotX, cbY)
            .lineTo(plotX + plotW, cbY)
            .stroke()
            .undash()
            .restore();

          doc
            .fillColor('#52525B')
            .font('Helvetica')
            .fontSize(6.5)
            .text(`Cost Basis ${formatUsd(summary.totalCostBasis)}`, plotX + 4, cbY - 9);
        }

        // Area fill under curve
        const lineColor = periodPos ? emerald : red;
        doc.save();
        doc.moveTo(xForIdx(0), plotY + plotH);
        points.forEach((p, i) => {
          doc.lineTo(xForIdx(i), yForVal(p.value));
        });
        doc.lineTo(xForIdx(points.length - 1), plotY + plotH);
        doc.closePath();
        doc.fillColor(periodPos ? '#D1FAE5' : '#FEE2E2').fillOpacity(0.45).fill();
        doc.restore();

        // Valuation curve stroke
        doc.save().strokeColor(lineColor).lineWidth(1.6);
        points.forEach((p, i) => {
          const x = xForIdx(i);
          const y = yForVal(p.value);
          if (i === 0) doc.moveTo(x, y);
          else doc.lineTo(x, y);
        });
        doc.stroke().restore();

        // X-axis labels (start, mid, end)
        const midIdx = Math.floor((points.length - 1) / 2);
        const labelIndices = [0, midIdx, points.length - 1];
        labelIndices.forEach((idx, pos) => {
          const x = xForIdx(idx);
          const align = pos === 0 ? 'left' : pos === 2 ? 'right' : 'center';
          const boxX = pos === 0 ? x : pos === 2 ? x - 60 : x - 30;
          doc
            .fillColor(mutedInk)
            .font('Helvetica')
            .fontSize(7)
            .text(formatShortDate(points[idx].time), boxX, plotY + plotH + 6, {
              width: 60,
              align,
            });
        });
      } else {
        doc
          .fillColor(mutedInk)
          .font('Helvetica')
          .fontSize(9)
          .text(
            'Add one or more tracked holdings to render the historical portfolio valuation curve.',
            leftX + 16,
            cursorY + chartBoxH / 2 - 6,
            { width: pageWidth - 32, align: 'center' }
          );
      }

      cursorY += chartBoxH + 22;

      // ====================================================================
      // 4. ASSET HOLDINGS BREAKDOWN TABLE
      // ====================================================================
      doc
        .fillColor(darkInk)
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text('Asset Holdings Breakdown', leftX, cursorY);

      cursorY += 18;

      const cols = [
        { label: 'Asset', x: leftX + 6, w: 66, align: 'left' as const },
        { label: 'Market', x: leftX + 74, w: 48, align: 'left' as const },
        { label: 'Qty', x: leftX + 124, w: 48, align: 'right' as const },
        { label: 'Avg Cost', x: leftX + 174, w: 66, align: 'right' as const },
        { label: 'Live Spot', x: leftX + 242, w: 66, align: 'right' as const },
        { label: 'Market Value', x: leftX + 310, w: 72, align: 'right' as const },
        { label: 'Unrealized P&L', x: leftX + 384, w: 94, align: 'right' as const },
        { label: 'Weight', x: leftX + 480, w: 40, align: 'right' as const },
      ];

      const drawTableHeader = (y: number) => {
        doc.rect(leftX, y, pageWidth, 20).fill('#09090B');
        doc.fillColor('#FAFAFA').font('Helvetica-Bold').fontSize(7.5);
        cols.forEach((c) => {
          doc.text(c.label, c.x, y + 6, { width: c.w, align: c.align });
        });
        return y + 20;
      };

      cursorY = drawTableHeader(cursorY);

      if (summary.holdings.length === 0) {
        doc
          .rect(leftX, cursorY, pageWidth, 28)
          .fillAndStroke('#FFFFFF', borderCol);
        doc
          .fillColor(mutedInk)
          .font('Helvetica')
          .fontSize(8.5)
          .text('No asset holdings recorded in this account.', leftX + 12, cursorY + 9);
        cursorY += 28;
      } else {
        summary.holdings.forEach((h, idx) => {
          const rowH = 24;
          if (cursorY + rowH > doc.page.height - 76) {
            doc.addPage();
            cursorY = drawTableHeader(doc.page.margins.top);
          }

          const bg = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
          doc.rect(leftX, cursorY, pageWidth, rowH).fill(bg);
          doc
            .moveTo(leftX, cursorY + rowH)
            .lineTo(leftX + pageWidth, cursorY + rowH)
            .strokeColor(borderCol)
            .lineWidth(0.5)
            .stroke();

          const rowPos = h.unrealizedPnl >= 0;
          const textY = cursorY + 7.5;

          doc
            .fillColor(darkInk)
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .text(h.symbol, cols[0].x, textY, { width: cols[0].w, ellipsis: true, lineBreak: false });

          doc
            .fillColor(mutedInk)
            .font('Helvetica')
            .fontSize(7.5)
            .text(h.market, cols[1].x, textY, { width: cols[1].w, ellipsis: true, lineBreak: false });

          doc
            .fillColor(darkInk)
            .font('Helvetica')
            .fontSize(7.5)
            .text(String(h.quantity), cols[2].x, textY, {
              width: cols[2].w,
              align: 'right',
              lineBreak: false,
            });

          doc
            .fillColor(mutedInk)
            .text(formatPrice(h.avgCost), cols[3].x, textY, {
              width: cols[3].w,
              align: 'right',
              lineBreak: false,
            });

          doc
            .fillColor(darkInk)
            .text(
              h.hasLivePrice && h.livePrice !== null ? formatPrice(h.livePrice) : 'Cost basis',
              cols[4].x,
              textY,
              { width: cols[4].w, align: 'right', lineBreak: false }
            );

          doc
            .fillColor(darkInk)
            .font('Helvetica-Bold')
            .text(formatUsd(h.currentValue), cols[5].x, textY, {
              width: cols[5].w,
              align: 'right',
              lineBreak: false,
            });

          doc
            .fillColor(rowPos ? emerald : red)
            .font('Helvetica-Bold')
            .text(
              `${formatSignedUsd(h.unrealizedPnl)} (${rowPos ? '+' : ''}${h.unrealizedPnlPercent}%)`,
              cols[6].x,
              textY,
              { width: cols[6].w, align: 'right', lineBreak: false }
            );

          doc
            .fillColor(mutedInk)
            .font('Helvetica')
            .text(`${h.allocationPercent}%`, cols[7].x, textY, {
              width: cols[7].w,
              align: 'right',
              lineBreak: false,
            });

          cursorY += rowH;
        });
      }

      // ====================================================================
      // 5. PAGE FOOTERS & DISCLOSURE
      // ====================================================================
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const origBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const footerY = doc.page.height - 32;
        doc
          .moveTo(leftX, footerY - 7)
          .lineTo(leftX + pageWidth, footerY - 7)
          .strokeColor(borderCol)
          .lineWidth(0.5)
          .stroke();

        doc
          .fillColor(mutedInk)
          .font('Helvetica')
          .fontSize(6.8)
          .text(
            'Educational & Informational Record Only: Market prices reflect public spot feeds where available and are not audited brokerage or tax statements.',
            leftX,
            footerY,
            { width: pageWidth - 68, lineBreak: false }
          );

        doc.text(`Page ${i + 1} of ${range.count}`, leftX + pageWidth - 62, footerY, {
          width: 62,
          align: 'right',
          lineBreak: false,
        });
        doc.page.margins.bottom = origBottomMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
