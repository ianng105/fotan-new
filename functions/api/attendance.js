export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(request.url);
  const meetingId = url.searchParams.get('meeting_id');
  const personType = url.searchParams.get('person_type');
  const personId = url.searchParams.get('person_id');

  try {
    if (request.method === 'GET') {
      if (personType && personId) {
        const rows = await env.DB.prepare(
          'SELECT a.*, m.date, m.type as meeting_type FROM attendance a JOIN meetings m ON a.meeting_id=m.id WHERE a.person_type=? AND a.person_id=? ORDER BY m.date DESC'
        ).bind(personType, personId).all();
        return Response.json(rows.results, { headers: cors });
      }
      const rows = await env.DB.prepare('SELECT * FROM attendance WHERE meeting_id=? ORDER BY person_type, id').bind(meetingId).all();
      return Response.json(rows.results, { headers: cors });
    }
    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, _delete } = body;
      if (!id) return Response.json({ error: 'ID required' }, { status: 400, headers: cors });
      // Hard-delete via PUT (Cloudflare WAF 封鎖 DELETE method)
      if (_delete) {
        await env.DB.prepare("DELETE FROM attendance WHERE id=?").bind(id).run();
        return Response.json({ ok: true, deleted: true }, { headers: cors });
      }
      // Only update fields that are present in the request body
      const fieldDefs = [
        { key: 'substitute', map: v => v || '' },
        { key: 'payment', map: v => v ?? null },
        { key: 'payment_method', map: v => v || '' },
        { key: 'arrival_time', map: v => v === 'absent' ? 'absent|' + new Date().toISOString() : (v || '') },
        { key: 'remark', map: v => v || '' },
        { key: 'table_number', map: v => v || '' },
        { key: 'seat_order', map: v => v ?? null },
        { key: 'price_tier', map: v => v || '' }
      ];
      const sets = [], vals = [];
      for (const fd of fieldDefs) {
        if (body[fd.key] !== undefined && body[fd.key] !== null) {
          sets.push(fd.key + '=?');
          vals.push(fd.map(body[fd.key]));
        }
      }
      if (!sets.length) return Response.json({ ok: true }, { headers: cors });
      // 未付款不能簽到：如設定 arrival_time 且非 absent，必須已付費或免費
      const isAbsent = body.arrival_time === 'absent' || (body.arrival_time && body.arrival_time.startsWith && body.arrival_time.startsWith('absent|'));
      if (body.arrival_time && !isAbsent) {
        const row = await env.DB.prepare('SELECT payment FROM attendance WHERE id=?').bind(id).first();
        const effectivePayment = body.payment !== undefined && body.payment !== null ? body.payment : (row ? row.payment : '');
        if (effectivePayment !== 'paid' && effectivePayment !== 'free') {
          return Response.json({ error: '未付款不能簽到，請先完成付款' }, { status: 400, headers: cors });
        }
      }
      vals.push(id);
      await env.DB.prepare('UPDATE attendance SET ' + sets.join(',') + ' WHERE id=?').bind(...vals).run();
      return Response.json({ ok: true }, { headers: cors });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const { meeting_id, person_type, person_id, substitute, payment, payment_method, arrival_time, remark, table_number, seat_order } = body;
      // 未付款不能簽到
      const isAbsent2 = arrival_time === 'absent' || (arrival_time && arrival_time.startsWith && arrival_time.startsWith('absent|'));
      if (arrival_time && !isAbsent2 && payment !== 'paid' && payment !== 'free') {
        return Response.json({ error: '未付款不能簽到，請先完成付款' }, { status: 400, headers: cors });
      }
      const effectiveArrival = arrival_time === 'absent' ? 'absent|' + new Date().toISOString() : arrival_time;
      const result = await env.DB.prepare(
        'INSERT INTO attendance (meeting_id, person_type, person_id, substitute, payment, payment_method, arrival_time, remark, table_number, seat_order) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).bind(meeting_id, person_type, person_id, substitute || '', payment || '', payment_method || '', effectiveArrival || '', remark || '', table_number || '', seat_order ?? null).run();
      return Response.json({ id: result.meta.last_row_id }, { headers: cors });
    }
    if (request.method === 'DELETE') {
      const body = await request.json();
      const { id } = body;
      if (!id) return Response.json({ error: 'ID required' }, { status: 400, headers: cors });
      await env.DB.prepare("DELETE FROM attendance WHERE id=?").bind(id).run();
      return Response.json({ ok: true }, { headers: cors });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: cors });
  }
}
