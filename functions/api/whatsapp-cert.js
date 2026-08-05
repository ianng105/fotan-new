export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(request.url);

  async function verifyToken(token) {
    if (!token) return null;
    const row = await env.DB.prepare(
      "SELECT * FROM skill_tokens WHERE token=? AND active=1 AND expires_at > datetime('now')"
    ).bind(token).first();
    return row || null;
  }

  try {
    // GET — list all
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const row = await env.DB.prepare('SELECT * FROM whatsapp_cert WHERE id=?').bind(id).first();
        if (!row) return Response.json({ error: 'not found' }, { status: 404, headers: cors });
        return Response.json(row, { headers: cors });
      }
      // ?missing=1 — list people from last meeting without certs
      if (url.searchParams.get('missing') === '1') {
        const lastMeeting = await env.DB.prepare('SELECT * FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!lastMeeting) return Response.json({ meeting: null, people: [] }, { headers: cors });

        const att = await env.DB.prepare(
          'SELECT a.person_type, a.person_id, a.payment FROM attendance a WHERE a.meeting_id=?'
        ).bind(lastMeeting.id).all();

        // All people already linked to a cert
        const linked = await env.DB.prepare(
          "SELECT person_type, person_id FROM whatsapp_cert WHERE person_type != '' AND person_id != 0"
        ).all();
        const linkedSet = new Set(linked.results.map(r => `${r.person_type}:${r.person_id}`));

        // Get all members and guests
        const members = await env.DB.prepare('SELECT id, name, tel FROM members WHERE active=1').all();
        const guests = await env.DB.prepare('SELECT id, name, tel FROM guests WHERE active=1').all();

        const personMap = {};
        for (const m of members.results) personMap[`member:${m.id}`] = m;
        for (const g of guests.results) personMap[`guest:${g.id}`] = g;

        const missing = [];
        for (const a of att.results) {
          const key = `${a.person_type}:${a.person_id}`;
          const p = personMap[key];
          if (!p) continue;
          if (linkedSet.has(key)) continue;
          missing.push({ person_type: a.person_type, person_id: a.person_id, name: p.name, tel: p.tel, payment: a.payment });
        }

        return Response.json({ meeting: lastMeeting, people: missing }, { headers: cors });
      }

      const rows = await env.DB.prepare('SELECT * FROM whatsapp_cert ORDER BY created_at DESC').all();
      return Response.json(rows.results, { headers: cors });
    }

    // DELETE — cannot delete linked certs
    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, amount, note } = body;
      if (!id) return Response.json({ error: 'id required' }, { status: 400, headers: cors });
      if (amount !== undefined) await env.DB.prepare('UPDATE whatsapp_cert SET amount=? WHERE id=?').bind(amount, id).run();
      if (note !== undefined) await env.DB.prepare('UPDATE whatsapp_cert SET note=? WHERE id=?').bind(note, id).run();
      return Response.json({ ok: true }, { headers: cors });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return Response.json({ error: 'id required' }, { status: 400, headers: cors });

      const row = await env.DB.prepare('SELECT * FROM whatsapp_cert WHERE id=?').bind(id).first();
      if (!row) return Response.json({ ok: true }, { headers: cors });
      if (row.person_type && row.person_id) {
        return Response.json({ error: '已關聯憑證無法刪除，請先取消關聯' }, { status: 409, headers: cors });
      }
      await env.R2.delete(row.r2_key);
      await env.DB.prepare('DELETE FROM whatsapp_cert WHERE id=?').bind(id).run();
      return Response.json({ ok: true }, { headers: cors });
    }

    // PUT — link / unlink / update comment
    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, person_type, person_id, person_name, comment, note } = body;
      if (!id) return Response.json({ error: 'id required' }, { status: 400, headers: cors });

      const sets = [];
      const vals = [];
      if (person_type !== undefined) { sets.push('person_type=?'); vals.push(person_type || ''); }
      if (person_id !== undefined) { sets.push('person_id=?'); vals.push(person_id || 0); }
      if (person_name !== undefined) { sets.push('person_name=?'); vals.push(person_name || ''); }
      if (comment !== undefined) { sets.push('comment=?'); vals.push(comment); }
      if (note !== undefined) { sets.push('note=?'); vals.push(note); }

      if (sets.length) {
        vals.push(id);
        await env.DB.prepare(`UPDATE whatsapp_cert SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
      }

      return Response.json({ ok: true }, { headers: cors });
    }

    // POST — create (base64 photo) — requires valid token
    if (request.method === 'POST') {
      const body = await request.json();
      const { token, from_number, data, comment, note, person_type, person_id, person_name } = body;
      if (!token) return Response.json({ error: 'token required' }, { status: 401, headers: cors });
      const tok = await verifyToken(token);
      if (!tok) return Response.json({ error: 'invalid or expired token' }, { status: 401, headers: cors });
      if (!from_number) return Response.json({ error: 'from_number required' }, { status: 400, headers: cors });

      const ts = Date.now();
      let r2Key = '';
      let filename = '';
      let fileSize = 0;

      if (data) {
        const base64 = data.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        r2Key = `whatsapp-cert-${ts}-${from_number.replace(/[^0-9]/g,'')}.jpg`;
        fileSize = bytes.length;

        await env.R2.put(r2Key, bytes, {
          httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' }
        });
        filename = `${ts}.jpg`;
      }

      await env.DB.prepare(
        'INSERT INTO whatsapp_cert (from_number, filename, r2_key, comment, note, content_type, file_size, person_type, person_id, person_name) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).bind(from_number, filename, r2Key, comment || '', note || '', data ? 'image/jpeg' : '', fileSize, person_type || '', person_id || 0, person_name || '').run();

      return Response.json({ ok: true, r2_key: r2Key }, { headers: cors });
    }

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: cors });
  }
}
