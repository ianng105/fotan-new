export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const certIds = url.searchParams.get('ids') || url.searchParams.get('id') || '';
  const ids = certIds.split(',').filter(Boolean);

  if (!ids.length) {
    return new Response('<h1>缺少憑證 ID</h1><p>請提供 ?ids=1,2,3</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  try {
    // Fetch certs with person info
    const certs = [];
    for (const id of ids) {
      const cert = await env.DB.prepare('SELECT * FROM whatsapp_cert WHERE id=?').bind(id).first();
      if (!cert) continue;

      let person = null;
      if (cert.person_type && cert.person_id) {
        const table = cert.person_type === 'member' ? 'members' : 'guests';
        person = await env.DB.prepare(`SELECT name, tel FROM ${table} WHERE id=?`).bind(cert.person_id).first();
      }

      // Get receipt number
      let receiptNum = cert.receipt_number;
      if (!receiptNum) {
        const counterRow = await env.DB.prepare("SELECT value FROM settings WHERE key='receipt_counter'").first();
        let counter = parseInt(counterRow?.value || '101', 10);
        const yearPrefix = new Date().getFullYear().toString().slice(2);
        receiptNum = '#' + yearPrefix + '-' + String(counter).padStart(6, '0');
        await env.DB.prepare("UPDATE whatsapp_cert SET receipt_number=? WHERE id=?").bind(receiptNum, id).run();
        counter++;
        await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('receipt_counter', ?)").bind(String(counter)).run();
      }

      const personName = cert.person_name || (person ? person.name : '未關聯');
      const displayAmount = cert.amount > 0 ? cert.amount : 398;
      const certDate = cert.created_at ? cert.created_at.substring(0, 10) : '—';

      certs.push({ ...cert, personName, displayAmount, certDate, receiptNumber: receiptNum });
    }

    if (!certs.length) {
      return new Response('<h1>找不到憑證</h1>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Build print-friendly HTML receipt
    const now = new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
    const receiptRows = certs.map(c => `
      <div class="receipt-page">
        <div class="header">
          <div class="logo">火炭商務協會有限公司</div>
          <div class="subtitle">FOTAN BUSINESS ASSOCIATION LIMITED</div>
          <div class="address">沙田火炭穗禾路1號豐利工業中心地下3B舖</div>
        </div>

        <div class="title">🧾 官方收據 OFFICIAL RECEIPT</div>

        <table class="info-table">
          <tr><td class="label">收據編號</td><td class="value">${c.receiptNumber}</td></tr>
          <tr><td class="label">日期</td><td class="value">${c.certDate}</td></tr>
          <tr><td class="label">委員姓名</td><td class="value">${esc(c.personName)}</td></tr>
          ${c.from_number ? `<tr><td class="label">WhatsApp</td><td class="value">${esc(c.from_number)}</td></tr>` : ''}
        </table>

        <table class="items-table">
          <thead><tr><th>項目</th><th>單價</th><th>數量</th><th>金額</th></tr></thead>
          <tbody>
            <tr>
              <td>2026年7月至12月 委員例會餐費（共6個月）</td>
              <td>HK$220</td>
              <td>6</td>
              <td>HK$${c.displayAmount.toLocaleString()}</td>
            </tr>
            <tr class="total-row"><td colspan="3">合計</td><td>HK$${c.displayAmount.toLocaleString()}</td></tr>
          </tbody>
        </table>

        <div class="payment-info">
          <p><strong>付款方式：</strong> ${c.note || '轉數快 FPS'}</p>
          ${c.r2_key ? `<p><strong>付款證明：</strong> 已上傳截圖 (WhatsApp)</p>` : ''}
        </div>

        <div class="stamp-area">
          <div class="stamp-box">公司蓋章</div>
          <div class="stamp-box">授權簽署</div>
        </div>

        <div class="footer-note">
          此為電腦編製收據，毋須簽署。<br>
          This is a computer-generated receipt. No signature is required.<br>
          生成時間：${now}
        </div>
      </div>
    `).join('<div class="page-break"></div>');

    const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>火炭會 — 官方收據</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Noto Sans HK', sans-serif; color: #1a1a1a; background: #fff; padding: 30px; }
  .receipt-page { max-width: 700px; margin: 0 auto 30px; padding: 40px; border: 2px solid #0d9488; border-radius: 4px; }
  .header { text-align: center; margin-bottom: 24px; }
  .logo { font-size: 20px; font-weight: 700; color: #0d9488; }
  .subtitle { font-size: 11px; color: #666; margin-top: 2px; }
  .address { font-size: 10px; color: #888; margin-top: 4px; }
  .title { text-align: center; font-size: 22px; font-weight: 700; margin: 20px 0; padding: 12px 0; border-top: 2px solid #0d9488; border-bottom: 2px solid #0d9488; letter-spacing: 4px; }
  .info-table { width: 100%; margin: 16px 0; border-collapse: collapse; }
  .info-table td { padding: 6px 8px; font-size: 14px; }
  .info-table .label { font-weight: 600; width: 100px; color: #555; }
  .items-table { width: 100%; margin: 20px 0; border-collapse: collapse; }
  .items-table th { background: #0d9488; color: #fff; padding: 10px 8px; font-size: 13px; text-align: left; }
  .items-table td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #0d9488; padding-top: 12px; }
  .payment-info { margin: 16px 0; font-size: 13px; line-height: 1.8; }
  .stamp-area { display: flex; justify-content: space-between; margin: 40px 0 20px; gap: 40px; }
  .stamp-box { flex: 1; height: 80px; border: 2px dashed #ccc; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 14px; }
  .footer-note { text-align: center; font-size: 10px; color: #888; margin-top: 30px; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  .page-break { page-break-after: always; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #0d9488; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; z-index: 999; }
  .print-btn:hover { background: #0f766e; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
    .receipt-page { border: none; margin: 0; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ 列印 / 儲存 PDF</button>
  ${receiptRows}
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
