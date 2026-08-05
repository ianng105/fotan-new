import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadChineseFont } from '../lib/font-loader.js';
import { loadReceiptTemplate } from '../lib/receipt-template.js';

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const DARK = rgb(0.15, 0.15, 0.15);
const GRAY = rgb(0.35, 0.35, 0.35);

// ── Helper: draw text ──
function T(page, text, x, y, font, size, color = BLACK) {
  if (!text) return;
  page.drawText(String(text), { x, y, font, size, color });
}

// ── Helper: erase sample data with white rect, then draw text ──
function field(page, text, x, y, w, h, font, size, color = BLACK) {
  // White rectangle to cover sample data
  page.drawRectangle({ x, y, width: w, height: h, color: WHITE });
  // Draw actual text (slightly inset from left edge of rect)
  if (text) T(page, text, x + 2, y + (h - size) / 2, font, size, color);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const certId = url.searchParams.get('cert_id');

  if (!certId) return new Response('Missing cert_id', { status: 400 });

  try {
    // Fetch cert data
    const cert = await env.DB.prepare('SELECT * FROM whatsapp_cert WHERE id=?').bind(certId).first();
    if (!cert) return new Response('Cert not found', { status: 404 });

    let person = null;
    if (cert.person_type && cert.person_id) {
      const table = cert.person_type === 'member' ? 'members' : 'guests';
      person = await env.DB.prepare(`SELECT name, tel FROM ${table} WHERE id=?`).bind(cert.person_id).first();
    }

    const personName = cert.person_name || (person ? person.name : '未關聯');
    const personTel = person ? person.tel : '';
    const dateStr = cert.created_at
      ? new Date(cert.created_at.replace(' ', 'T') + 'Z').toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })
      : '—';
    const certIdStr = String(cert.id).padStart(6, '0');

    // ── Load template PDF ──
    const templateBuf = loadReceiptTemplate();
    const templateDoc = await PDFDocument.load(templateBuf);
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const [templatePage] = await doc.copyPages(templateDoc, [0]);
    const page = doc.addPage(templatePage);

    // ── Load font ──
    let font, helvetica;
    try {
      const fontData = await loadChineseFont(env);
      font = await doc.embedFont(fontData);
    } catch (e) { /* fallback */ }
    helvetica = await doc.embedFont(StandardFonts.Helvetica);
    if (!font) font = helvetica;

    // ── Embed payment proof image ──
    let proofImage = null;
    if (cert.r2_key) {
      try {
        const obj = await env.R2.get(cert.r2_key);
        if (obj) {
          const buf = new Uint8Array(await obj.arrayBuffer());
          const key = cert.r2_key.toLowerCase();
          proofImage = (key.endsWith('.jpg') || key.endsWith('.jpeg'))
            ? await doc.embedJpg(buf)
            : await doc.embedPng(buf);
        }
      } catch (e) { /* ignore */ }
    }

    // ── POSITIONS (A4: 595.28 × 841.89 pt, origin bottom-left) ──
    // These are mapped from the template image (1785×2525 px).
    // Each field: [x, y, width, height] for erase rect; text placed inside.

    // --- Receipt number & date (upper-right area below title) ---
    // Template sample: "#000101" at right side
    field(page, `#${certIdStr}`,   360, 724, 195, 18, font, 13, DARK);
    field(page, dateStr,           360, 707, 195, 16, font,  9, GRAY);

    // --- Left column: Payer info ---
    // Template sample: "CHAN TAI MAN, David", tel, WhatsApp
    field(page, personName,                48, 613, 270, 22, font, 14, DARK);
    field(page, personTel || '—',          48, 588, 200, 18, font, 10, DARK);
    field(page, cert.from_number || '—',   48, 563, 200, 18, font, 10, DARK);

    // --- Right column: Payment info ---
    // Template sample: payment date, "FPS"
    field(page, dateStr,                  335, 613, 210, 22, font, 14, DARK);
    field(page, 'FPS / 轉數快',           335, 588, 210, 18, font, 10, DARK);

    // --- Remarks ---
    if (cert.note) {
      field(page, cert.note, 48, 445, 500, 55, font, 9, DARK);
    }
    if (cert.comment) {
      field(page, cert.comment, 48, cert.note ? 390 : 445, 500, 50, font, 9, DARK);
    }

    // --- Payment proof image ---
    if (proofImage) {
      const imgY = cert.note ? 330 : (cert.comment ? 330 : 400);
      const maxW = 480;
      const maxH = 220;
      const d = proofImage.scale(1);
      const s = Math.min(maxW / d.width, maxH / d.height, 1);
      const imgW = d.width * s;
      const imgH = d.height * s;
      const imgX = 48;
      // Erase sample placeholder with white rect
      page.drawRectangle({ x: imgX - 4, y: imgY - imgH - 4, width: maxW + 8, height: maxH + 8, color: WHITE });
      page.drawImage(proofImage, { x: imgX, y: imgY - imgH, width: imgW, height: imgH });
    }

    // ── Footer generation timestamp ──
    const nowStr = new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
    field(page, nowStr, 350, 32, 200, 14, font, 7, GRAY);

    const pdfBytes = await doc.save();

    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${certIdStr}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}
