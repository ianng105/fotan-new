import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadChineseFont } from '../lib/font-loader.js';

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  async function verifyToken(token) {
    if (!token) return null;
    const row = await env.DB.prepare(
      "SELECT * FROM skill_tokens WHERE token=? AND active=1 AND expires_at > datetime('now')"
    ).bind(token).first();
    return row || null;
  }

  try {
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const url = new URL(request.url);
    const action = body.action || url.searchParams.get('action') || '';
    const token = body.token || url.searchParams.get('token') || '';

    // All actions require valid token
    const tok = await verifyToken(token);
    if (!tok) return Response.json({ ok: false, error: 'invalid or expired token' }, { headers: cors });

    // ── import_guests ──────────────────────────────
    if (action === 'import_guests') {
      const guests = body.guests;
      if (!guests || !Array.isArray(guests) || !guests.length) {
        return Response.json({ ok: false, error: 'guests array required' }, { headers: cors });
      }
      let mid = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
      mid = mid ? mid.id : null;
      if (!mid) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });

      let added = 0, skipped = 0, paid = 0, unpaid = 0, freeCount = 0;
      const results = [];
      for (const g of guests) {
        const name = String(g.name || '').trim();
        if (!name) continue;

        let payStatus = '';
        const rawPay = String(g.payment || '').toLowerCase();
        if (rawPay === 'paid' || rawPay === '已付款' || rawPay.includes('💰')) { payStatus = 'paid'; paid++; }
        else if (rawPay === 'free' || rawPay === '免費' || rawPay === '免付款' || rawPay.includes('🆓')) { payStatus = 'free'; freeCount++; }
        else { unpaid++; }

        const existGuest = await env.DB.prepare('SELECT id FROM guests WHERE name=? AND active=1').bind(name).first();
        const existMember = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
        if (existGuest || existMember) {
          // Update payment for existing attendance if member
          if (existMember) {
            await env.DB.prepare(
              "UPDATE attendance SET payment=? WHERE meeting_id=? AND person_type='member' AND person_id=?"
            ).bind(payStatus || 'unpaid', mid, existMember.id).run();
            results.push({ name, status: 'updated_member', payment: payStatus || 'unpaid' });
          } else {
            results.push({ name, status: 'skipped', reason: 'duplicate' });
          }
          skipped++; continue;
        }

        const result = await env.DB.prepare(
          'INSERT INTO guests (name, professional, tel, invited_by, meeting_id, table_number, seat_order) VALUES (?,?,?,?,?,?,?)'
        ).bind(name, g.professional || '', g.tel || '', g.invited_by || '', mid, g.table_number || '', g.seat_order ?? null).run();
        const guestId = result.meta.last_row_id;
        await env.DB.prepare(
          'INSERT INTO attendance (meeting_id, person_type, person_id, payment, table_number, seat_order) VALUES (?,?,?,?,?,?)'
        ).bind(mid, 'guest', guestId, payStatus, g.table_number || '', g.seat_order ?? null).run();
        added++;
        results.push({ name, status: 'added', payment: payStatus || 'unpaid', guest_id: guestId });
      }
      return Response.json({
        ok: true, meeting_id: mid, added, skipped, paid_count: paid, unpaid_count: unpaid, free_count: freeCount,
        message: `已匯入 ${added} 位來賓（跳過 ${skipped} 位重複），${paid} 已付 ${freeCount} 免費 ${unpaid} 未付`,
        results: results.slice(0, 50)
      }, { headers: cors });
    }

    // ── update_payment ─────────────────────────────
    if (action === 'update_payment') {
      const { attendance_id, payment, price_tier } = body;
      if (!attendance_id) return Response.json({ ok: false, error: 'attendance_id required' }, { headers: cors });
      const validPayments = ['paid', 'free', 'unpaid', ''];
      if (!validPayments.includes(payment)) return Response.json({ ok: false, error: 'payment must be paid/free/unpaid' }, { headers: cors });
      await env.DB.prepare('UPDATE attendance SET payment=? WHERE id=?').bind(payment, attendance_id).run();
      if (price_tier !== undefined) {
        await env.DB.prepare('UPDATE attendance SET price_tier=? WHERE id=?').bind(price_tier, attendance_id).run();
      }
      return Response.json({ ok: true, message: `已更新 attendance #${attendance_id} 付款為 ${payment || '未付款'}` }, { headers: cors });
    }

    // ── update_table ────────────────────────────────
    if (action === 'update_table') {
      const { meeting_id, person_id, person_type, table_number, seat_order } = body;
      if (!meeting_id || !person_id || !person_type) return Response.json({ ok: false, error: 'meeting_id, person_id, person_type required' }, { headers: cors });
      if (!['member','guest'].includes(person_type)) return Response.json({ ok: false, error: 'person_type must be member or guest' }, { headers: cors });
      const sets = [], vals = [];
      if (table_number !== undefined) { sets.push('table_number=?'); vals.push(table_number || ''); }
      if (seat_order !== undefined) { sets.push('seat_order=?'); vals.push(seat_order); }
      if (!sets.length) return Response.json({ ok: false, error: 'table_number or seat_order required' }, { headers: cors });
      vals.push(meeting_id, person_type, person_id);
      await env.DB.prepare(
        'UPDATE attendance SET ' + sets.join(',') + ' WHERE meeting_id=? AND person_type=? AND person_id=?'
      ).bind(...vals).run();
      // Sync to person default table_number + seat_order
      const personSets = [], personVals = [];
      if (table_number !== undefined) { personSets.push('table_number=?'); personVals.push(table_number || ''); }
      if (seat_order !== undefined) { personSets.push('seat_order=?'); personVals.push(seat_order); }
      personVals.push(person_id);
      const personTable = person_type === 'member' ? 'members' : 'guests';
      await env.DB.prepare(`UPDATE ${personTable} SET ${personSets.join(',')} WHERE id=?`).bind(...personVals).run();
      return Response.json({ ok: true, message: `已更新 ${person_type} #${person_id} 枱號/座位` }, { headers: cors });
    }

    // ── mark_arrival ────────────────────────────────
    if (action === 'mark_arrival') {
      const { attendance_id, arrival_time } = body;
      if (!attendance_id) return Response.json({ ok: false, error: 'attendance_id required' }, { headers: cors });
      const isAbsent = arrival_time === 'absent' || (arrival_time && arrival_time.startsWith && arrival_time.startsWith('absent|'));
      // 未付款不能簽到
      if (arrival_time && !isAbsent) {
        const row = await env.DB.prepare('SELECT payment, table_number, seat_order, person_type, person_id FROM attendance WHERE id=?').bind(attendance_id).first();
        if (!row || (row.payment !== 'paid' && row.payment !== 'free')) {
          return Response.json({ ok: false, error: '未付款不能簽到，請先完成付款' }, { headers: cors });
        }
        // Auto-fill table_number and seat_order from person record if missing
        let tbl = row.table_number || '';
        let seat = row.seat_order;
        if (!tbl) {
          const personTable = row.person_type === 'member' ? 'members' : 'guests';
          const person = await env.DB.prepare(`SELECT table_number, seat_order FROM ${personTable} WHERE id=?`).bind(row.person_id).first();
          if (person) { tbl = person.table_number || ''; seat = person.seat_order; }
        }
        await env.DB.prepare('UPDATE attendance SET arrival_time=?, table_number=?, seat_order=? WHERE id=?')
          .bind(arrival_time, tbl, seat, attendance_id).run();
      } else {
        const absentVal = 'absent|' + new Date().toISOString();
        await env.DB.prepare('UPDATE attendance SET arrival_time=? WHERE id=?')
          .bind(absentVal, attendance_id).run();
        return Response.json({ ok: true, message: `已標記 attendance #${attendance_id} 為 缺席` }, { headers: cors });
      }
      return Response.json({ ok: true, message: `已標記 attendance #${attendance_id} 為 ${arrival_time}` }, { headers: cors });
    }

    // ── search ──────────────────────────────────────
    if (action === 'search') {
      const { q } = body;
      if (!q) return Response.json({ ok: false, error: 'q required' }, { headers: cors });
      const pattern = `%${q}%`;
      const members = await env.DB.prepare(
        "SELECT 'member' as type, id, name, tel, professional FROM members WHERE name LIKE ? AND active=1"
      ).bind(pattern).all();
      const guests = await env.DB.prepare(
        "SELECT 'guest' as type, id, name, tel, professional FROM guests WHERE name LIKE ? AND active=1"
      ).bind(pattern).all();
      return Response.json({ ok: true, results: [...members.results, ...guests.results] }, { headers: cors });
    }

    // ── meeting_stats ───────────────────────────────
    if (action === 'meeting_stats') {
      const { meeting_id } = body;
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
        mid = latest ? latest.id : null;
      }
      if (!mid) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
      const stats = await env.DB.prepare(`
        SELECT m.*, COUNT(a.id) as total,
          SUM(CASE WHEN a.person_type='member' THEN 1 ELSE 0 END) as members,
          SUM(CASE WHEN a.person_type='guest' THEN 1 ELSE 0 END) as guests,
          SUM(CASE WHEN a.payment='paid' THEN 1 ELSE 0 END) as paid,
          SUM(CASE WHEN a.payment='free' THEN 1 ELSE 0 END) as free,
          SUM(CASE WHEN a.payment='unpaid' THEN 1 ELSE 0 END) as unpaid,
          SUM(CASE WHEN a.arrival_time IS NOT NULL AND a.arrival_time!='' AND a.arrival_time NOT LIKE 'absent|%' THEN 1 ELSE 0 END) as arrived,
          SUM(CASE WHEN a.arrival_time LIKE 'absent|%' THEN 1 ELSE 0 END) as absent,
          SUM(CASE WHEN a.payment='paid' THEN
            CASE
              WHEN a.price_tier='early_bird' THEN COALESCE(NULLIF(m.early_bird_fee,0), 388)
              WHEN a.price_tier='walk_in' THEN COALESCE(NULLIF(m.walk_in_fee,0), 388)
              WHEN a.price_tier='committee' THEN COALESCE(NULLIF(m.committee_fee,0), 388)
              WHEN a.person_type='member' AND mem.role IS NOT NULL AND mem.role != '會員' THEN COALESCE(NULLIF(m.committee_fee,0), 220)
              WHEN a.person_type='guest' THEN COALESCE(NULLIF(m.guest_fee,0), 388)
              WHEN a.person_type='member' THEN COALESCE(NULLIF(m.member_fee,0), 388)
              ELSE COALESCE(NULLIF(m.member_fee,0), 388)
            END
          ELSE 0 END) as revenue
        FROM meetings m LEFT JOIN attendance a ON m.id=a.meeting_id LEFT JOIN members mem ON a.person_type='member' AND a.person_id=mem.id
        WHERE m.id=? GROUP BY m.id
      `).bind(mid).first();
      return Response.json({ ok: true, stats }, { headers: cors });
    }

    // ── list_meetings ───────────────────────────────
    if (action === 'list_meetings') {
      const meetings = await env.DB.prepare(
        'SELECT id, date, type, collector, guest_fee FROM meetings ORDER BY date DESC'
      ).all();
      return Response.json({ ok: true, meetings: meetings.results }, { headers: cors });
    }

    // ── update_meeting ──────────────────────────────
    if (action === 'update_meeting') {
      const { meeting_id, date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee, table_number } = body;
      if (!meeting_id) return Response.json({ ok: false, error: 'meeting_id required' }, { headers: cors });
      const sets = [], vals = [];
      for (const [k, v] of Object.entries({ date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee, table_number })) {
        if (v !== undefined) { sets.push(k + '=?'); vals.push(v); }
      }
      if (!sets.length) return Response.json({ ok: false, error: 'no fields to update' }, { headers: cors });
      vals.push(meeting_id);
      await env.DB.prepare('UPDATE meetings SET ' + sets.join(',') + ' WHERE id=?').bind(...vals).run();
      return Response.json({ ok: true }, { headers: cors });
    }

    // ── payment_summary ─────────────────────────────
    if (action === 'payment_summary') {
      const { meeting_id } = body;
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
        mid = latest ? latest.id : null;
      }
      if (!mid) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
      const summary = await env.DB.prepare(
        'SELECT payment, COUNT(*) as count FROM attendance WHERE meeting_id=? GROUP BY payment'
      ).bind(mid).all();
      return Response.json({ ok: true, meeting_id: mid, summary: summary.results }, { headers: cors });
    }

    // ── list_attendance ─────────────────────────────
    if (action === 'list_attendance') {
      const { meeting_id } = body;
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
        mid = latest ? latest.id : null;
      }
      if (!mid) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
      const rows = await env.DB.prepare(`
        SELECT a.id, a.person_type, a.person_id, a.arrival_time, a.payment, a.table_number, a.seat_order,
          CASE WHEN a.person_type='member' THEN m.name ELSE g.name END as name,
          CASE WHEN a.person_type='member' THEN m.professional ELSE g.professional END as professional
        FROM attendance a
        LEFT JOIN members m ON a.person_type='member' AND a.person_id=m.id
        LEFT JOIN guests g ON a.person_type='guest' AND a.person_id=g.id
        WHERE a.meeting_id=?
        ORDER BY name
      `).bind(mid).all();
      return Response.json({ ok: true, meeting_id: mid, attendance: rows.results }, { headers: cors });
    }

    // ── create_member ───────────────────────────────
    if (action === 'create_member') {
      const { name, tel, email, professional, role } = body;
      if (!name) return Response.json({ ok: false, error: 'name required' }, { headers: cors });
      const exist = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
      if (exist) return Response.json({ ok: false, error: 'member already exists' }, { headers: cors });
      const result = await env.DB.prepare(
        'INSERT INTO members (name, tel, email, professional, role) VALUES (?,?,?,?,?)'
      ).bind(name, tel || '', email || '', professional || '', role || '會員').run();
      return Response.json({ ok: true, member_id: result.meta.last_row_id, message: '已新增會員：' + name }, { headers: cors });
    }

    // ── update_member ───────────────────────────────
    if (action === 'update_member') {
      const { member_id, name, tel, email, professional, role, fee_paid_date, bio, tags, table_number, seat_order, active } = body;
      if (!member_id) return Response.json({ ok: false, error: 'member_id required' }, { headers: cors });
      const fields = [];
      const values = [];
      for (const f of ['name','tel','email','professional','role','fee_paid_date','bio','tags','table_number','seat_order','active']) {
        const v = body[f];
        if (v !== undefined) { fields.push(f+'=?'); values.push(v); }
      }
      if (!fields.length) return Response.json({ ok: false, error: 'no fields to update' }, { headers: cors });
      values.push(member_id);
      await env.DB.prepare('UPDATE members SET '+fields.join(',')+' WHERE id=?').bind(...values).run();
      return Response.json({ ok: true, message: '已更新會員 #' + member_id }, { headers: cors });
    }

    // ── update_guest ────────────────────────────────
    if (action === 'update_guest') {
      const { guest_id, name, professional, tel, invited_by, meeting_id, vip, table_number, seat_order, active } = body;
      if (!guest_id) return Response.json({ ok: false, error: 'guest_id required' }, { headers: cors });
      const fields = [];
      const values = [];
      for (const f of ['name','professional','tel','invited_by','meeting_id','vip','table_number','seat_order','active']) {
        const v = body[f];
        if (v !== undefined) { fields.push(f+'=?'); values.push(v); }
      }
      if (!fields.length) return Response.json({ ok: false, error: 'no fields to update' }, { headers: cors });
      values.push(guest_id);
      await env.DB.prepare('UPDATE guests SET '+fields.join(',')+' WHERE id=?').bind(...values).run();
      return Response.json({ ok: true, message: '已更新來賓 #' + guest_id }, { headers: cors });
    }

    // ── delete_person ───────────────────────────────
    if (action === 'delete_person') {
      const { person_type, person_id } = body;
      if (!person_type || !person_id) return Response.json({ ok: false, error: 'person_type and person_id required' }, { headers: cors });
      if (person_type === 'member') {
        await env.DB.prepare('UPDATE members SET active=0 WHERE id=?').bind(person_id).run();
      } else {
        await env.DB.prepare('UPDATE guests SET active=0 WHERE id=?').bind(person_id).run();
      }
      return Response.json({ ok: true, message: '已刪除 ' + person_type + ' #' + person_id }, { headers: cors });
    }

    // ── get_settings ────────────────────────────────
    if (action === 'get_settings') {
      const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      rows.results.forEach(r => { settings[r.key] = r.value; });
      return Response.json({ ok: true, settings }, { headers: cors });
    }

    // ── export_stats ────────────────────────────────
    if (action === 'export_stats') {
      const meetings = await env.DB.prepare(
        'SELECT m.*, COUNT(a.id) as total, SUM(CASE WHEN a.person_type=\'member\' THEN 1 ELSE 0 END) as members, SUM(CASE WHEN a.person_type=\'guest\' THEN 1 ELSE 0 END) as guests, SUM(CASE WHEN a.payment=\'paid\' THEN 1 ELSE 0 END) as paid, SUM(CASE WHEN a.payment=\'free\' THEN 1 ELSE 0 END) as free, SUM(CASE WHEN a.payment=\'unpaid\' THEN 1 ELSE 0 END) as unpaid, SUM(CASE WHEN a.arrival_time IS NOT NULL AND a.arrival_time!=\'\' AND a.arrival_time NOT LIKE \'absent|%\' THEN 1 ELSE 0 END) as arrived, SUM(CASE WHEN a.arrival_time LIKE \'absent|%\' THEN 1 ELSE 0 END) as absent FROM meetings m LEFT JOIN attendance a ON m.id=a.meeting_id GROUP BY m.id ORDER BY m.date DESC'
      ).all();
      const memberCount = await env.DB.prepare('SELECT COUNT(*) as c FROM members WHERE active=1').first();
      const guestCount = await env.DB.prepare('SELECT COUNT(*) as c FROM guests WHERE active=1').first();
      return Response.json({
        ok: true,
        member_count: memberCount.c,
        guest_count: guestCount.c,
        meetings: meetings.results
      }, { headers: cors });
    }

    // ── bulk_create_members ─────────────────────────
    if (action === 'bulk_create_members') {
      const members = body.members;
      if (!members || !Array.isArray(members) || !members.length) {
        return Response.json({ ok: false, error: 'members array required' }, { headers: cors });
      }
      let added = 0, skipped = 0;
      const results = [];
      for (const m of members) {
        const name = String(m.name || '').trim();
        if (!name) continue;
        const exist = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
        if (exist) { skipped++; results.push({ name, status: 'skipped', reason: 'duplicate' }); continue; }
        const result = await env.DB.prepare(
          'INSERT INTO members (name, tel, email, professional, role, fee_paid_date) VALUES (?,?,?,?,?,?)'
        ).bind(name, m.tel || '', m.email || '', m.professional || '', m.role || '會員', m.fee_paid_date || '').run();
        added++;
        results.push({ name, status: 'added', member_id: result.meta.last_row_id });
      }
      return Response.json({
        ok: true, added, skipped,
        message: `已新增 ${added} 位會員（跳過 ${skipped} 位重複）`,
        results: results.slice(0, 50)
      }, { headers: cors });
    }

    // ── upload_image ────────────────────────────────
    if (action === 'upload_image') {
      const { name, data, content_type } = body;
      if (!name || !data) return Response.json({ ok: false, error: 'name and data required' }, { headers: cors });
      const base64 = data.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await env.R2.put(name, bytes, {
        httpMetadata: { contentType: content_type || 'image/png', cacheControl: 'public, max-age=86400' }
      });
      return Response.json({ ok: true, url: `/api/image?name=${encodeURIComponent(name)}`, message: '已上傳圖片：' + name }, { headers: cors });
    }

    // ── delete_attendance ───────────────────────────
    if (action === 'delete_attendance') {
      const { attendance_id } = body;
      if (!attendance_id) return Response.json({ ok: false, error: 'attendance_id required' }, { headers: cors });
      // Soft-clear: 清除簽到相關欄位但保留付款記錄
      await env.DB.prepare('UPDATE attendance SET arrival_time=NULL, table_number=NULL, seat_order=NULL, substitute=NULL, remark=NULL WHERE id=?').bind(attendance_id).run();
      return Response.json({ ok: true, message: '已清除 attendance #' + attendance_id }, { headers: cors });
    }

    // ── delete_attendance_batch ──────────────────────
    if (action === 'delete_attendance_batch') {
      const { ids } = body;
      if (!ids || !Array.isArray(ids) || !ids.length) return Response.json({ ok: false, error: 'ids array required' }, { headers: cors });
      let deleted = 0;
      for (const id of ids) {
        await env.DB.prepare('UPDATE attendance SET arrival_time=NULL, table_number=NULL, seat_order=NULL, substitute=NULL, remark=NULL WHERE id=?').bind(id).run();
        deleted++;
      }
      return Response.json({ ok: true, message: '已清除 ' + deleted + ' 條 attendance records', deleted }, { headers: cors });
    }

    // ── delete_meeting ────────────────────────────────
    if (action === 'delete_meeting') {
      const { meeting_id } = body;
      if (!meeting_id) return Response.json({ ok: false, error: 'meeting_id required' }, { headers: cors });
      await env.DB.prepare('DELETE FROM attendance WHERE meeting_id=?').bind(meeting_id).run();
      await env.DB.prepare('DELETE FROM meetings WHERE id=?').bind(meeting_id).run();
      return Response.json({ ok: true, message: '已刪除會議 #' + meeting_id + ' 及其所有出席記錄' }, { headers: cors });
    }

    // ── create_meeting ───────────────────────────────
    if (action === 'create_meeting') {
      const { date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee } = body;
      if (!date) return Response.json({ ok: false, error: 'date required' }, { headers: cors });
      const result = await env.DB.prepare(
        'INSERT INTO meetings (date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(date, type || 'regular', collector || '', guest_fee || 0, member_fee || 0, committee_fee || 0, early_bird_fee || 0, walk_in_fee || 0).run();
      return Response.json({ ok: true, meeting_id: result.meta.last_row_id, message: '已建立會議：' + date }, { headers: cors });
    }

    // ── update_settings ──────────────────────────────
    if (action === 'update_settings') {
      const { settings } = body;
      if (!settings || typeof settings !== 'object') return Response.json({ ok: false, error: 'settings object required' }, { headers: cors });
      const stmts = [];
      for (const [k, v] of Object.entries(settings)) {
        stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').bind(k, String(v), String(v)));
      }
      await env.DB.batch(stmts);
      return Response.json({ ok: true, message: '已更新 ' + Object.keys(settings).length + ' 項設定' }, { headers: cors });
    }

    // ── create_guest ──────────────────────────────────
    if (action === 'create_guest') {
      const { name, professional, tel, invited_by, meeting_id, vip, payment, table_number, seat_order } = body;
      if (!name) return Response.json({ ok: false, error: 'name required' }, { headers: cors });
      const existG = await env.DB.prepare('SELECT id FROM guests WHERE name=? AND active=1').bind(name).first();
      const existM = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
      if (existG || existM) return Response.json({ ok: false, error: '已存在：' + name }, { headers: cors });
      let mid = meeting_id;
      if (!mid) { const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first(); mid = latest ? latest.id : null; }
      const result = await env.DB.prepare(
        'INSERT INTO guests (name, professional, tel, invited_by, meeting_id, vip, table_number, seat_order) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(name, professional || '', tel || '', invited_by || '', mid, vip ? 1 : 0, table_number || '', seat_order ?? null).run();
      const guestId = result.meta.last_row_id;
      if (mid) {
        await env.DB.prepare('INSERT INTO attendance (meeting_id, person_type, person_id, payment, table_number, seat_order) VALUES (?,?,?,?,?,?)')
          .bind(mid, 'guest', guestId, payment || '', table_number || '', seat_order ?? null).run();
      }
      return Response.json({ ok: true, guest_id: guestId, meeting_id: mid, message: '已新增來賓：' + name }, { headers: cors });
    }

    // ── add_to_meeting ────────────────────────────────
    if (action === 'add_to_meeting') {
      const { meeting_id, person_type, person_id, payment, table_number, seat_order } = body;
      if (!person_type || !person_id) return Response.json({ ok: false, error: 'person_type and person_id required' }, { headers: cors });
      let mid = meeting_id;
      if (!mid) { const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first(); mid = latest ? latest.id : null; }
      if (!mid) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
      // Check if already in meeting
      const exist = await env.DB.prepare('SELECT id FROM attendance WHERE meeting_id=? AND person_type=? AND person_id=?').bind(mid, person_type, person_id).first();
      if (exist) return Response.json({ ok: false, error: '此人已在此會議中 (attendance #' + exist.id + ')' }, { headers: cors });
      // Verify person exists
      if (person_type === 'member') {
        const m = await env.DB.prepare('SELECT id FROM members WHERE id=? AND active=1').bind(person_id).first();
        if (!m) return Response.json({ ok: false, error: '會員 #' + person_id + ' 不存在' }, { headers: cors });
      } else {
        const g = await env.DB.prepare('SELECT id FROM guests WHERE id=? AND active=1').bind(person_id).first();
        if (!g) return Response.json({ ok: false, error: '來賓 #' + person_id + ' 不存在' }, { headers: cors });
      }
      const result = await env.DB.prepare(
        'INSERT INTO attendance (meeting_id, person_type, person_id, payment, table_number, seat_order) VALUES (?,?,?,?,?,?)'
      ).bind(mid, person_type, person_id, payment || '', table_number || '', seat_order ?? null).run();
      return Response.json({ ok: true, attendance_id: result.meta.last_row_id, message: '已加入會議 #' + mid + '（' + person_type + ' #' + person_id + '）' }, { headers: cors });
    }

    // ── link_cert ──────────────────────────────────────
    if (action === 'link_cert') {
      const { cert_id, person_type, person_id, person_name } = body;
      if (!cert_id) return Response.json({ ok: false, error: 'cert_id required' }, { headers: cors });
      if (!person_type || !person_id) return Response.json({ ok: false, error: 'person_type and person_id required' }, { headers: cors });
      const cert = await env.DB.prepare('SELECT * FROM whatsapp_cert WHERE id=?').bind(cert_id).first();
      if (!cert) return Response.json({ ok: false, error: 'cert not found' }, { headers: cors });
      await env.DB.prepare(
        'UPDATE whatsapp_cert SET person_type=?, person_id=?, person_name=? WHERE id=?'
      ).bind(person_type, person_id, person_name || '', cert_id).run();
      // Fill in payment_method if blank
      const att = await env.DB.prepare(
        'SELECT id, payment_method FROM attendance WHERE meeting_id=(SELECT meeting_id FROM guests WHERE id=? LIMIT 1) AND person_type=? AND person_id=?'
      ).bind(person_id, person_type, person_id).first();
      if (att) {
        await env.DB.prepare(
          "UPDATE attendance SET payment_method='receipt_uploaded' WHERE id=? AND (payment_method IS NULL OR payment_method='')"
        ).bind(att.id).run();
      }
      return Response.json({ ok: true, message: '已關聯 ' + cert.from_number + ' 憑證到 ' + (person_name || person_type+'#'+person_id) }, { headers: cors });
    }

    // ── unlink_cert ────────────────────────────────────
    if (action === 'unlink_cert') {
      const { cert_id } = body;
      if (!cert_id) return Response.json({ ok: false, error: 'cert_id required' }, { headers: cors });
      await env.DB.prepare(
        "UPDATE whatsapp_cert SET person_type='', person_id=0, person_name='' WHERE id=?"
      ).bind(cert_id).run();
      return Response.json({ ok: true, message: '已取消關聯' }, { headers: cors });
    }

    // ── list_certs ─────────────────────────────────────
    if (action === 'list_certs') {
      const { from_number, person_type, person_id, unlinked } = body;
      let sql = 'SELECT * FROM whatsapp_cert WHERE 1=1';
      const params = [];
      if (from_number) { sql += ' AND from_number=?'; params.push(from_number); }
      if (person_type && person_id) { sql += ' AND person_type=? AND person_id=?'; params.push(person_type, person_id); }
      if (unlinked) { sql += " AND (person_type='' OR person_id=0)"; }
      sql += ' ORDER BY created_at DESC LIMIT 200';
      const rows = await env.DB.prepare(sql).bind(...params).all();
      return Response.json({ ok: true, certs: rows.results, count: rows.results.length }, { headers: cors });
    }

    // ── list_members ──────────────────────────────────
    if (action === 'list_members') {
      const rows = await env.DB.prepare('SELECT * FROM members WHERE active=1 ORDER BY id').all();
      return Response.json({ ok: true, members: rows.results, count: rows.results.length }, { headers: cors });
    }

    // ── list_guests ───────────────────────────────────
    if (action === 'list_guests') {
      const rows = await env.DB.prepare('SELECT * FROM guests WHERE active=1 ORDER BY id').all();
      return Response.json({ ok: true, guests: rows.results, count: rows.results.length }, { headers: cors });
    }

    // ═══════════════════════════════════════════════════
    // 🍽  Table Management API
    // ═══════════════════════════════════════════════════

    // ── list_tables ──────────────────────────────────
    // ── payment_audit ──────────────────────────────────
    if (action === 'payment_audit') {
      let mid = body.meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id, date FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!latest) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
        mid = latest.id;
      }
      const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(mid).first();
      if (!meeting) return Response.json({ ok: false, error: 'meeting not found' }, { headers: cors });

      const att = await env.DB.prepare(
        'SELECT a.* FROM attendance a WHERE a.meeting_id=? ORDER BY a.person_type, a.person_id'
      ).bind(mid).all();

      // Get all linked receipt images from DB
      const wcerts = await env.DB.prepare(
        "SELECT id, from_number, filename, r2_key, comment, note, person_type, person_id, person_name FROM whatsapp_cert WHERE person_type != '' AND person_id != 0"
      ).all();
      const mreceipts = await env.DB.prepare('SELECT * FROM member_receipts').all();
      const docs = await env.DB.prepare(
        "SELECT * FROM documents WHERE person_type IN ('member','guest')"
      ).all();

      // R2: find checkin-upload receipt images (receipt-att-{att_id}.jpg)
      const r2Receipts = {};
      try {
        const r2List = await env.R2.list({ prefix: 'receipt-att-' });
        for (const obj of r2List.objects) {
          const m = obj.key.match(/receipt-att-(\d+)/);
          if (m) r2Receipts[parseInt(m[1])] = { type: 'checkin_upload', r2_key: obj.key, image_url: '/api/image?name='+obj.key, size: obj.size };
        }
      } catch (e) { /* R2 list may fail, skip */ }

      // Build person name lookup
      const members = await env.DB.prepare('SELECT id, name, tel FROM members').all();
      const guests = await env.DB.prepare('SELECT id, name, tel, invited_by FROM guests').all();
      const pMap = {};
      for (const m of members.results) pMap['member:'+m.id] = m;
      for (const g of guests.results) pMap['guest:'+g.id] = g;

      // Build receipt maps
      const wcertByPerson = {};
      for (const w of wcerts.results) {
        const k = w.person_type+':'+w.person_id;
        if (!wcertByPerson[k]) wcertByPerson[k] = [];
        wcertByPerson[k].push({ type: 'whatsapp', id: w.id, from_number: w.from_number, r2_key: w.r2_key, image_url: '/api/image?name='+w.r2_key, download_url: '/api/image?name='+w.r2_key+'&download=1', comment: w.comment, note: w.note });
      }
      const receiptByMember = {};
      for (const r of mreceipts.results) {
        if (!receiptByMember[r.member_id]) receiptByMember[r.member_id] = [];
        receiptByMember[r.member_id].push({ type: 'member_receipt', id: r.id, filename: r.filename, image_url: '/api/image?name='+r.filename, download_url: '/api/image?name='+r.filename+'&download=1'});
      }
      const docByPerson = {};
      for (const d of docs.results) {
        const k = d.person_type+':'+d.person_id;
        if (!docByPerson[k]) docByPerson[k] = [];
        docByPerson[k].push({ type: 'document', id: d.id, filename: d.filename, r2_key: d.r2_key, image_url: '/api/image?name='+d.r2_key, download_url: '/api/image?name='+d.r2_key+'&download=1'});
      }

      // Also collect ALL whatsapp certs (including unlinked) for the source summary
      const allWcerts = await env.DB.prepare('SELECT id, person_type, person_id FROM whatsapp_cert').all();
      const linkedWcerts = allWcerts.results.filter(w => w.person_type && w.person_id);
      const unlinkedWcerts = allWcerts.results.filter(w => !w.person_type || !w.person_id);

      const records = [];
      for (const a of att.results) {
        const pk = a.person_type+':'+a.person_id;
        const p = pMap[pk] || {};
        const receipts = [
          ...(wcertByPerson[pk] || []),
          ...(a.person_type==='member' ? (receiptByMember[a.person_id] || []) : []),
          ...(docByPerson[pk] || [])
        ];
        // Add R2 checkin-upload receipt if exists for this attendance
        if (r2Receipts[a.id]) receipts.push(r2Receipts[a.id]);
        records.push({
          attendance_id: a.id,
          person_type: a.person_type,
          person_id: a.person_id,
          name: p.name || '',
          tel: p.tel || '',
          invited_by: a.person_type==='guest' ? (p.invited_by || '') : '',
          payment: a.payment || '',
          payment_method: a.payment_method || '',
          arrival_time: a.arrival_time || '',
          price_tier: a.price_tier || '',
          table_number: a.table_number || '',
          seat_order: a.seat_order,
          receipts: receipts,
          receipt_count: receipts.length
        });
      }

      const stats = {
        total: records.length,
        paid: records.filter(r=>r.payment==='paid').length,
        free: records.filter(r=>r.payment==='free').length,
        unpaid: records.filter(r=>r.payment!=='paid'&&r.payment!=='free').length,
        with_receipt: records.filter(r=>r.receipt_count>0).length,
        without_receipt: records.filter(r=>r.receipt_count===0).length
      };

      // Receipt source summary
      const sourceSummary = {
        whatsapp_linked: linkedWcerts.length,
        whatsapp_unlinked: unlinkedWcerts.length,
        member_receipts: mreceipts.results.length,
        documents: docs.results.length,
        checkin_uploads: Object.keys(r2Receipts).length
      };

      return Response.json({
        ok: true,
        meeting: { id: meeting.id, date: meeting.date, type: meeting.type },
        stats,
        source_summary: sourceSummary,
        records
      }, { headers: cors });
    }

    if (action === 'list_tables') {
      const { meeting_id } = body;
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id, date, type FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!latest) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
        mid = latest.id;
      }
      const meeting = await env.DB.prepare('SELECT id, date, type FROM meetings WHERE id=?').bind(mid).first();
      // Get all attendance with person info
      const rows = await env.DB.prepare(`
        SELECT a.id as att_id, a.person_type, a.person_id, a.payment, a.table_number, a.seat_order,
          a.arrival_time, a.substitute, a.remark,
          CASE WHEN a.person_type='member' THEN m.name ELSE g.name END as name,
          CASE WHEN a.person_type='member' THEN m.professional ELSE g.professional END as professional,
          CASE WHEN a.person_type='member' THEN (m.role IS NOT NULL AND m.role != '會員') ELSE 0 END as is_committee,
          CASE WHEN a.person_type='guest' THEN g.vip ELSE 0 END as vip,
          CASE WHEN a.person_type='member' THEN m.tags ELSE '' END as tags
        FROM attendance a
        LEFT JOIN members m ON a.person_type='member' AND a.person_id=m.id
        LEFT JOIN guests g ON a.person_type='guest' AND a.person_id=g.id
        WHERE a.meeting_id=?
        ORDER BY CAST(a.table_number AS INTEGER), a.table_number, a.seat_order
      `).bind(mid).all();

      // Load table names from settings
      const settingRow = await env.DB.prepare(
        "SELECT value FROM settings WHERE key=?"
      ).bind('seating_names_' + mid).first();
      let tableNames = {};
      if (settingRow) {
        try { tableNames = JSON.parse(settingRow.value); } catch(e) {}
      }

      // Load table count from settings
      const countRow = await env.DB.prepare(
        "SELECT value FROM settings WHERE key=?"
      ).bind('seating_table_count_' + mid).first();
      const tableCount = countRow ? parseInt(countRow.value) || 0 : 0;

      // Build table map
      const tables = {}; // key -> {name, people:[]}
      const unassigned = [];
      for (const a of rows.results) {
        const tbl = a.table_number || '';
        if (!tbl) {
          unassigned.push(a);
          continue;
        }
        if (!tables[tbl]) tables[tbl] = { table_number: tbl, name: tableNames[tbl] || ('第 ' + tbl + ' 號枱'), people: [] };
        tables[tbl].people.push(a);
      }
      // Include empty tables within configured count
      const existingNums = Object.keys(tables).map(Number);
      const maxDataTbl = existingNums.length ? Math.max(...existingNums) : 0;
      const effectiveCount = Math.max(maxDataTbl, tableCount, 0);
      for (let i = 1; i <= effectiveCount; i++) {
        const k = String(i);
        if (!tables[k]) tables[k] = { table_number: k, name: tableNames[k] || ('第 ' + k + ' 號枱'), people: [] };
      }

      const tableList = Object.keys(tables).sort((a,b) => parseInt(a)-parseInt(b)).map(k => tables[k]);
      const totalPeople = rows.results.length;
      const assignedPeople = totalPeople - unassigned.length;

      return Response.json({
        ok: true,
        meeting_id: mid,
        meeting_date: meeting.date,
        meeting_type: meeting.type,
        table_count: tableList.length,
        total_people: totalPeople,
        assigned_people: assignedPeople,
        unassigned_people: unassigned.length,
        tables: tableList,
        unassigned
      }, { headers: cors });
    }

    // ── update_table_names ───────────────────────────
    if (action === 'update_table_names') {
      const { meeting_id, names } = body;
      if (!meeting_id) return Response.json({ ok: false, error: 'meeting_id required' }, { headers: cors });
      if (!names || typeof names !== 'object') return Response.json({ ok: false, error: 'names object required, e.g. {"1":"VIP枱","2":"主家席"}' }, { headers: cors });
      const key = 'seating_names_' + meeting_id;
      const value = JSON.stringify(names);
      await env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
      ).bind(key, value, value).run();
      return Response.json({
        ok: true,
        message: '已更新 ' + Object.keys(names).length + ' 張枱名稱',
        table_names: names
      }, { headers: cors });
    }

    // ── auto_seat ────────────────────────────────────
    if (action === 'auto_seat') {
      const { group, meeting_id, table_number: targetTbl, surname, tag, max_per_table } = body;
      if (!group) return Response.json({ ok: false, error: 'group required: committee/vip/member/guest/surname/tag' }, { headers: cors });
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id, date, type FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!latest) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
        mid = latest.id;
      }
      const meeting = await env.DB.prepare('SELECT id, date, type FROM meetings WHERE id=?').bind(mid).first();
      const maxPerTable = parseInt(max_per_table) || 12;

      // Get all attendance for this meeting
      const att = await env.DB.prepare(`
        SELECT a.id as att_id, a.person_type, a.person_id, a.table_number, a.payment,
          CASE WHEN a.person_type='member' THEN m.name ELSE g.name END as name,
          CASE WHEN a.person_type='member' THEN m.role ELSE '' END as role,
          CASE WHEN a.person_type='member' THEN m.tags ELSE '' END as tags,
          CASE WHEN a.person_type='guest' THEN g.vip ELSE 0 END as vip
        FROM attendance a
        LEFT JOIN members m ON a.person_type='member' AND a.person_id=m.id
        LEFT JOIN guests g ON a.person_type='guest' AND a.person_id=g.id
        WHERE a.meeting_id=?
      `).bind(mid).all();

      // Filter by group
      let filtered = [];
      for (const p of att.results) {
        let match = false;
        if (group === 'committee') match = !!(p.role && p.role !== '會員');
        else if (group === 'vip') match = p.vip === 1;
        else if (group === 'member') match = p.person_type === 'member' && (!p.role || p.role === '會員');
        else if (group === 'guest') match = p.person_type === 'guest' && p.vip !== 1;
        else if (group === 'surname') match = !!(surname && p.name && p.name.charAt(0) === surname);
        else if (group === 'tag') match = !!(tag && p.tags && p.tags.split(',').map(t => t.trim()).includes(tag));
        if (match) filtered.push(p);
      }

      if (!filtered.length) {
        const desc = {committee:'委員',vip:'VIP嘉賓',member:'會員',guest:'來賓',surname:'姓'+surname+'嘅人',tag:'標籤「'+tag+'」嘅人'}[group] || group;
        return Response.json({ ok: false, message: '搵唔到任何' + desc, count: 0 }, { headers: cors });
      }

      // Build map of which tables already have people
      const tablePeople = {};
      for (const a of att.results) {
        if (a.table_number) {
          if (!tablePeople[a.table_number]) tablePeople[a.table_number] = [];
          tablePeople[a.table_number].push(a);
        }
      }
      const existingNums = Object.keys(tablePeople).map(Number);
      const maxExisting = existingNums.length ? Math.max(...existingNums) : 0;

      function nextFreeTable(startFrom) {
        for (let i = Math.max(startFrom, 1); i <= Math.max(maxExisting, 1); i++) {
          if (!tablePeople[String(i)] || tablePeople[String(i)].length === 0) return String(i);
        }
        return String(Math.max(maxExisting, 0) + 1);
      }

      // Assign people to tables, splitting if over capacity
      const assignments = [];
      let currentTbl = targetTbl || nextFreeTable(1);
      let batch = [];
      let batchNames = [];

      for (const p of filtered) {
        batch.push(p);
        batchNames.push(p.name);
        if (batch.length >= maxPerTable) {
          assignments.push({ table: currentTbl, people: batch, names: batchNames });
          batch = [];
          batchNames = [];
          currentTbl = nextFreeTable(parseInt(currentTbl) + 1);
        }
      }
      if (batch.length > 0) {
        assignments.push({ table: currentTbl, people: batch, names: batchNames });
      }

      // Execute updates
      const allUpdates = [];
      for (const asgn of assignments) {
        asgn.people.forEach((p, si) => {
          const seat = si + 1;
          allUpdates.push(
            env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.att_id).run()
          );
          allUpdates.push(
            p.person_type === 'member' ?
              env.DB.prepare('UPDATE members SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.person_id).run() :
              env.DB.prepare('UPDATE guests SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.person_id).run()
          );
        });
      }
      await Promise.all(allUpdates);

      const summary = assignments.map(a => '🍽 ' + a.table + ' 號枱：' + a.names.join('、'));
      const groupDesc = {committee:'委員',vip:'VIP嘉賓',member:'會員',guest:'來賓',surname:'姓'+surname+'嘅人',tag:'標籤「'+tag+'」嘅人'}[group] || group;
      const meetingInfo = '📅 ' + meeting.date + ' ' + ({regular:'例會',special:'特別會議',anniversary:'週年聚餐'}[meeting.type] || meeting.type);

      return Response.json({
        ok: true,
        message: '✅ ' + meetingInfo + '\n已將 ' + filtered.length + ' 位' + groupDesc + '排好位！\n' + summary.join('\n'),
        meeting_id: mid,
        meeting_date: meeting.date,
        people: filtered.map(p => p.name).join('、'),
        tables: assignments.map(a => a.table),
        count: filtered.length
      }, { headers: cors });
    }

    // ── move_table ───────────────────────────────────
    if (action === 'move_table') {
      const { from_table, to_table, meeting_id, max_per_table, force } = body;
      if (!from_table || !to_table) return Response.json({ ok: false, error: 'from_table and to_table required' }, { headers: cors });
      if (from_table === to_table) return Response.json({ ok: false, error: 'from_table and to_table must be different' }, { headers: cors });
      let mid = meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id, date, type FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!latest) return Response.json({ ok: false, error: 'no meeting found' }, { headers: cors });
        mid = latest.id;
      }
      const meeting = await env.DB.prepare('SELECT id, date, type FROM meetings WHERE id=?').bind(mid).first();
      const maxPerTbl = parseInt(max_per_table) || 12;

      // Count existing on target table
      const existing = await env.DB.prepare(
        'SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND table_number=?'
      ).bind(mid, to_table).first();
      const existingCount = existing ? existing.c : 0;
      const available = Math.max(0, maxPerTbl - existingCount);

      // Get all people on source table
      const peopleRes = await env.DB.prepare(
        `SELECT a.id as att_id, a.person_type, a.person_id,
          CASE WHEN a.person_type='member' THEN m.name ELSE g.name END as name
        FROM attendance a
        LEFT JOIN members m ON a.person_type='member' AND a.person_id=m.id
        LEFT JOIN guests g ON a.person_type='guest' AND a.person_id=g.id
        WHERE a.meeting_id=? AND a.table_number=?`
      ).bind(mid, from_table).all();

      if (!peopleRes.results.length) {
        return Response.json({ ok: false, message: '第 ' + from_table + ' 號枱冇人喎！' }, { headers: cors });
      }

      const allPeople = peopleRes.results;
      const fit = allPeople.slice(0, available);
      const overflow = allPeople.slice(available);
      const moves = [];

      // Move people that fit
      for (const p of fit) {
        moves.push(
          env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=NULL WHERE id=?').bind(to_table, p.att_id).run()
        );
        moves.push(
          p.person_type === 'member' ?
            env.DB.prepare('UPDATE members SET table_number=?, seat_order=NULL WHERE id=?').bind(to_table, p.person_id).run() :
            env.DB.prepare('UPDATE guests SET table_number=?, seat_order=NULL WHERE id=?').bind(to_table, p.person_id).run()
        );
      }

      let message = '';
      let overflowCount = 0;
      if (overflow.length > 0 && !force) {
        message = '⚠️ 第 ' + to_table + ' 號枱只能容納 ' + maxPerTbl + ' 人（已有 ' + existingCount + ' 人，剩 ' + available + ' 位）。已搬 ' + fit.length + ' 人，第 ' + from_table + ' 號枱仲有 ' + overflow.length + ' 人因爆滿未搬。';
        overflowCount = overflow.length;
      } else if (overflow.length > 0 && force) {
        for (let k = 0; k < overflow.length; k += maxPerTbl) {
          const batch = overflow.slice(k, k + maxPerTbl);
          const nextTbl = String(parseInt(to_table) + 1 + Math.floor(k / maxPerTbl));
          for (const p of batch) {
            moves.push(
              env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=NULL WHERE id=?').bind(nextTbl, p.att_id).run()
            );
            moves.push(
              p.person_type === 'member' ?
                env.DB.prepare('UPDATE members SET table_number=?, seat_order=NULL WHERE id=?').bind(nextTbl, p.person_id).run() :
                env.DB.prepare('UPDATE guests SET table_number=?, seat_order=NULL WHERE id=?').bind(nextTbl, p.person_id).run()
            );
          }
        }
        message = '✅ 已將第 ' + from_table + ' 號枱 ' + allPeople.length + ' 人搬走！第 ' + to_table + ' 號枱已滿 (' + maxPerTbl + ' 人)，其餘分到後續枱號。';
        overflowCount = overflow.length;
      }

      await Promise.all(moves);

      if (!message) {
        const names = allPeople.map(p => p.name).join('、');
        message = '✅ 已將第 ' + from_table + ' 號枱 ' + allPeople.length + ' 人全部搬去第 ' + to_table + ' 號枱！\n' + names;
      }

      return Response.json({
        ok: true,
        message: '(' + meeting.date + ') ' + message,
        meeting_id: mid,
        meeting_date: meeting.date,
        from_table, to_table,
        moved: fit.length,
        overflow: overflowCount,
        total: allPeople.length
      }, { headers: cors });
    }

    // ── generate_receipt ─────────────────────────
    if (action === 'generate_receipt') {
      let { name, amount, phone, date, event, text } = body;

      // Parse natural language text input
      if (!name && text) {
        const match = text.match(/(.+?)\s*(?:paid|已付|付款)\s*\$?(\d+)/i);
        if (match) { name = match[1].trim(); amount = parseInt(match[2]); }
      }
      if (!name) return Response.json({ ok: false, error: 'name required' }, { headers: cors });
      if (!amount || isNaN(amount)) return Response.json({ ok: false, error: 'valid amount required' }, { headers: cors });

      // Get receipt counter
      let counterRow = await env.DB.prepare("SELECT value FROM settings WHERE key='receipt_counter'").first();
      let counter = counterRow ? parseInt(counterRow.value) : 151;
      if (isNaN(counter) || counter < 151 || counter > 200) counter = 151;

      const receiptNum = String(counter).padStart(7, '0');
      const issueDate = date || new Date().toISOString().split('T')[0];

      // Increment and save counter
      const nextCounter = counter >= 200 ? 151 : counter + 1;
      await env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('receipt_counter', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
      ).bind(String(nextCounter), String(nextCounter)).run();

      try {
        const PAGE_W = 595.28, PAGE_H = 841.89;
        const BLACK = rgb(0,0,0), BLUE = rgb(0.05, 0.15, 0.55);

        // Template coordinates (848×1264 px) — same as chatbot.js TPL
        const TPL = {
          receiptNo: { x: 580, y: 110, size: 8 },
          payerName: { x: 280, y: 420, size: 11 },
          dateDD:    { x: 380, y: 540, size: 11 },
          dateMM:    { x: 460, y: 540, size: 11 },
          dateYYYY:  { x: 540, y: 540, size: 11 },
          amount:    { x: 420, y: 680, size: 11 },
          eventName: { x: 280, y: 830, size: 11 },
        };
        function tplX(px) { return px * (PAGE_W / 848); }
        function tplY(py) { return PAGE_H - py * (PAGE_H / 1264); }

        const doc = await PDFDocument.create();
        doc.registerFontkit(fontkit);

        let chFont = null;
        try { const fd = await loadChineseFont(env); chFont = await doc.embedFont(fd); } catch(e) {}
        const F = chFont;

        // Try to load background PNG template from R2
        let bgBytes = null;
        try {
          const bgObj = await env.R2.get('templates/receipt-bg.png');
          if (!bgObj) {
            try {
              const staticUrl = 'http://127.0.0.1:8787/' + encodeURIComponent('火炭會receipt_template.png');
              const resp = await fetch(staticUrl);
              if (resp.ok) {
                const data = new Uint8Array(await resp.arrayBuffer());
                await env.R2.put('templates/receipt-bg.png', data, {
                  httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' }
                });
                bgBytes = data;
              }
            } catch (fetchErr) { /* not reachable */ }
          } else {
            bgBytes = new Uint8Array(await bgObj.arrayBuffer());
          }
        } catch (e) { /* R2 access error, skip background */ }

        const page = doc.addPage([PAGE_W, PAGE_H]);

        if (bgBytes) {
          const isPNG = bgBytes.length > 3 && bgBytes[1] === 0x50 && bgBytes[2] === 0x4E;
          const bgImage = isPNG ? await doc.embedPng(bgBytes) : await doc.embedJpg(bgBytes);
          page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

          // Overlay text on template
          if (F) {
            if (receiptNum) page.drawText(receiptNum, { x: tplX(TPL.receiptNo.x), y: tplY(TPL.receiptNo.y), font: F, size: TPL.receiptNo.size, color: BLUE });
            if (name) page.drawText(String(name), { x: tplX(TPL.payerName.x), y: tplY(TPL.payerName.y), font: F, size: TPL.payerName.size, color: BLUE });
            if (issueDate) {
              const parts = issueDate.split('-');
              if (parts.length === 3) {
                page.drawText(parts[2], { x: tplX(TPL.dateDD.x), y: tplY(TPL.dateDD.y), font: F, size: TPL.dateDD.size, color: BLUE });
                page.drawText(parts[1], { x: tplX(TPL.dateMM.x), y: tplY(TPL.dateMM.y), font: F, size: TPL.dateMM.size, color: BLUE });
                page.drawText(parts[0], { x: tplX(TPL.dateYYYY.x), y: tplY(TPL.dateYYYY.y), font: F, size: TPL.dateYYYY.size, color: BLUE });
              }
            }
            if (amount && !isNaN(amount)) {
              page.drawText('HK$ ' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ','), { x: tplX(TPL.amount.x), y: tplY(TPL.amount.y), font: F, size: TPL.amount.size, color: BLUE });
            }
            if (event) page.drawText(String(event), { x: tplX(TPL.eventName.x), y: tplY(TPL.eventName.y), font: F, size: TPL.eventName.size, color: BLUE });
          }
        } else {
          // ── Fallback: draw receipt from scratch ──
          const GRAY = rgb(0.38,0.38,0.38), LIGHT = rgb(0.55,0.55,0.55);
          const GREEN = rgb(0.09,0.62,0.29), LINE = rgb(0.85,0.85,0.85);

          function pt(mm) { return mm * 2.8346457; }
          let chFont2 = null, helvetica = null;
          try { const fd = await loadChineseFont(); chFont2 = await doc.embedFont(fd); } catch(e) {}
          try { helvetica = await doc.embedFont(StandardFonts.Helvetica); } catch(e) {}
          if (!helvetica) helvetica = chFont2;
          const FF = chFont2 || helvetica, FB = helvetica;
          const hasCN = !!chFont2;
          function s(t) { return hasCN ? String(t) : String(t).replace(/[^\x00-\x7F]/g, '?'); }

          const MARGIN = 50;
          let y = PAGE_H - MARGIN;
          if (hasCN) { page.drawText('火炭會', { x: MARGIN, y, font: FF, size: 11, color: GRAY }); }
          page.drawText('Fo Tan Chapter', { x: PAGE_W - MARGIN, y, font: FB, size: 8, color: LIGHT });
          y -= pt(6);
          if (hasCN) { page.drawText('付款收據', { x: PAGE_W/2, y, font: FF, size: 24, color: GREEN }); }
          page.drawText('PAYMENT RECEIPT', { x: PAGE_W/2, y, font: FB, size: 14, color: GREEN });
          y -= pt(30);
          const rowH = pt(16);
          if (FF) page.drawText('付款人: ' + (name||'—'), { x: MARGIN, y, font: FF, size: 12, color: BLACK }); y -= rowH;
          if (FF) page.drawText('金額: HK$ ' + String(amount||0).replace(/\B(?=(\d{3})+(?!\d))/g, ','), { x: MARGIN, y, font: FF, size: 12, color: BLACK }); y -= rowH;
          if (FF) page.drawText('日期: ' + (issueDate||'—'), { x: MARGIN, y, font: FF, size: 12, color: BLACK }); y -= rowH;
          if (event && FF) page.drawText('事由: ' + event, { x: MARGIN, y, font: FF, size: 12, color: BLACK });
        }

        const pdfBytes = await doc.save();

        const r2Key = 'receipts/receipt-' + receiptNum + '.pdf';
        await env.R2.put(r2Key, pdfBytes, {
          httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-cache' }
        });

        const downloadUrl = '/api/image?name=' + encodeURIComponent(r2Key) + '&download=1';

        return Response.json({
          ok: true,
          receipt_number: receiptNum,
          name, amount, phone: phone || '', date: issueDate,
          download_url: downloadUrl,
          message: '🧾 收據已生成！#' + receiptNum + ' — ' + name + ' HK$' + amount + '\n📥 下載：' + downloadUrl
        }, { headers: cors });

      } catch (e) {
        return Response.json({ ok: false, error: 'PDF generation failed: ' + e.message }, { headers: cors });
      }
    }

    return Response.json({ ok: false, error: `unknown action: ${action}. Valid: import_guests, update_payment, update_table, mark_arrival, search, meeting_stats, list_meetings, create_meeting, update_meeting, delete_meeting, payment_summary, list_attendance, list_members, list_guests, create_member, update_member, create_guest, update_guest, add_to_meeting, delete_person, delete_attendance, delete_attendance_batch, get_settings, update_settings, export_stats, bulk_create_members, upload_image, list_tables, update_table_names, auto_seat, move_table, payment_audit, link_cert, unlink_cert, list_certs, generate_receipt` }, { headers: cors });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { headers: cors });
  }
}
