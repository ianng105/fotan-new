// Standalone PDF converter — runs Puppeteer outside the Worker sandbox
// Start with: node pdf-worker.js
// Listens on port 3000, accepts HTML via POST, returns PDF

import puppeteer from 'puppeteer';
import http from 'node:http';

const PORT = process.env.PDF_PORT || 3000;
let browser = null;
let browserPromise = null;  // prevent concurrent launches

async function getBrowser() {
  if (browser && browser.connected) return browser;
  if (browserPromise) return browserPromise;  // wait for in-flight launch
  browserPromise = puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  browser = await browserPromise;
  browserPromise = null;
  return browser;
}

async function htmlToPdf(html) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close().catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, browser: !!(browser && browser.connected) }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('POST only');
    return;
  }

  try {
    // Collect request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const payload = JSON.parse(body.toString());

    if (!payload.html) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing html field' }));
      return;
    }

    console.log(`[pdf-worker] Converting ${payload.html.length} chars of HTML → PDF...`);
    const start = Date.now();
    const pdfBytes = await htmlToPdf(payload.html);
    const elapsed = Date.now() - start;
    console.log(`[pdf-worker] Done: ${(pdfBytes.length / 1024).toFixed(1)}KB PDF in ${elapsed}ms`);

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBytes.length
    });
    res.end(pdfBytes);
  } catch (e) {
    console.error('[pdf-worker] Error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[pdf-worker] Ready on http://127.0.0.1:${PORT}`);
  console.log('[pdf-worker] Puppeteer will launch on first request');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[pdf-worker] Shutting down...');
  server.close();
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});
