// Shared chatbot logic for chat.js and telegram.js

export function getTools() {
  return [
    { type: 'function', function: { name: 'get_meetings', description: '查詢所有會議列表', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'get_attendance', description: '查詢指定會議出席狀況', parameters: { type: 'object', properties: { meeting_id: { type: 'integer' } }, required: ['meeting_id'] } } },
    { type: 'function', function: { name: 'get_member_stats', description: '取得會員統計數據', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'search_people', description: '搜尋會員或來賓', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'get_member_detail', description: '查詢會員詳細資料，包含出席記錄', parameters: { type: 'object', properties: { member_id: { type: 'integer' } }, required: ['member_id'] } } },
    { type: 'function', function: { name: 'get_guest_list', description: '取得來賓列表', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'get_payment_summary', description: '查詢會議付款摘要', parameters: { type: 'object', properties: { meeting_id: { type: 'integer' } }, required: [] } } },
    { type: 'function', function: { name: 'get_industry_list', description: '取得行業分類列表', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'add_guest', description: '新增來賓', parameters: { type: 'object', properties: { name: { type: 'string' }, professional: { type: 'string' }, tel: { type: 'string' }, invited_by: { type: 'string' }, meeting_id: { type: 'integer' }, vip: { type: 'integer', description: '1=VIP嘉賓 0=來賓' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'bulk_add_guests', description: '批次匯入來賓名單，支援姓名、專業、邀請人、付款狀態、VIP標記。當用戶提供名單或列表時使用。每筆會自動檢查重複並建立出席記錄。', parameters: { type: 'object', properties: { guests: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, professional: { type: 'string' }, tel: { type: 'string' }, invited_by: { type: 'string' }, payment: { type: 'string', description: 'paid/已付 或 unpaid/未付' }, vip: { type: 'integer', description: '1=VIP嘉賓' } }, required: ['name'] } }, meeting_id: { type: 'integer', description: '會議ID，預設最新會議' } }, required: ['guests'] } } },
    { type: 'function', function: { name: 'add_meeting', description: '新增會議（可設定多層收費）', parameters: { type: 'object', properties: { date: { type: 'string' }, type: { type: 'string' }, collector: { type: 'string' }, guest_fee: { type: 'integer' }, member_fee: { type: 'integer' }, committee_fee: { type: 'integer' }, early_bird_fee: { type: 'integer' }, walk_in_fee: { type: 'integer' } }, required: ['date', 'type'] } } },
    { type: 'function', function: { name: 'update_payment', description: '更新出席記錄的付款狀態', parameters: { type: 'object', properties: { attendance_id: { type: 'integer' }, payment: { type: 'string', description: 'paid/free/unpaid' } }, required: ['attendance_id', 'payment'] } } },
    { type: 'function', function: { name: 'update_table', description: '設定枱號及座位次序', parameters: { type: 'object', properties: { meeting_id: { type: 'integer' }, person_type: { type: 'string' }, person_id: { type: 'integer' }, table_number: { type: 'string' }, seat_order: { type: 'integer', description: '座位次序 1-12' } }, required: ['meeting_id', 'person_type', 'person_id'] } } },
    { type: 'function', function: { name: 'mark_arrival', description: '標記簽到時間或缺席', parameters: { type: 'object', properties: { attendance_id: { type: 'integer' }, arrival_time: { type: 'string', description: 'HH:MM 或 absent' } }, required: ['attendance_id'] } } },
    { type: 'function', function: { name: 'get_settings', description: '查詢系統設定', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'delete_attendance', description: '刪除出席記錄', parameters: { type: 'object', properties: { attendance_id: { type: 'integer' } }, required: ['attendance_id'] } } },
    { type: 'function', function: { name: 'get_receipts', description: '查詢會員付款憑證', parameters: { type: 'object', properties: { member_id: { type: 'integer' } }, required: ['member_id'] } } },
    { type: 'function', function: { name: 'create_member', description: '新增會員', parameters: { type: 'object', properties: { name: { type: 'string' }, tel: { type: 'string' }, email: { type: 'string' }, professional: { type: 'string' }, role: { type: 'string', description: '會員/主席/副主席/秘書長/幹事' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'update_member', description: '更新會員資料（支援 tags、table_number、seat_order、active）', parameters: { type: 'object', properties: { member_id: { type: 'integer' }, name: { type: 'string' }, tel: { type: 'string' }, email: { type: 'string' }, professional: { type: 'string' }, role: { type: 'string', description: '會員/主席/副主席/秘書長/幹事' }, fee_paid_date: { type: 'string' }, bio: { type: 'string' }, tags: { type: 'string', description: '逗號分隔標籤' }, table_number: { type: 'string' }, seat_order: { type: 'integer' }, active: { type: 'integer', description: '0=軟刪除' } }, required: ['member_id'] } } },
    { type: 'function', function: { name: 'update_guest', description: '更新來賓資料或刪除來賓（設 active=0 即軟刪除）。當用戶要求刪除/移除來賓時，必須先 search_people 搵出來賓 ID，再用此 function 設 active=0', parameters: { type: 'object', properties: { guest_id: { type: 'integer', description: '來賓ID（必須先從 search_people 取得）' }, name: { type: 'string' }, tel: { type: 'string' }, professional: { type: 'string' }, invited_by: { type: 'string' }, vip: { type: 'integer', description: '1=VIP嘉賓' }, active: { type: 'integer', description: '0=軟刪除/移除，1=正常' } }, required: ['guest_id'] } } },
    { type: 'function', function: { name: 'bulk_create_members', description: '批次匯入會員名單（Excel/CSV 匯入）', parameters: { type: 'object', properties: { members: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, tel: { type: 'string' }, email: { type: 'string' }, professional: { type: 'string' }, role: { type: 'string' }, fee_paid_date: { type: 'string' } }, required: ['name'] } } }, required: ['members'] } } },
    { type: 'function', function: { name: 'upload_image', description: '上傳圖片到系統（QR Code、設定圖片等）', parameters: { type: 'object', properties: { name: { type: 'string', description: 'R2 檔名，如 qr-alipay' }, data: { type: 'string', description: 'Base64 圖片數據' }, content_type: { type: 'string', description: 'image/png 或 image/jpeg' } }, required: ['name', 'data'] } } },
    { type: 'function', function: { name: 'auto_seat', description: '自動排位：將指定群組的人全部放喺同一張枱（如一張枱唔夠會自動分多張枱）。適用指令如「把所有委員放同一枱」「將VIP放同一張枱」「把所有姓陳的放在同一枱」「把會員放埋一齊」「將素食嘅人放一齊」。', parameters: { type: 'object', properties: { group: { type: 'string', description: 'committee（委員）/ vip（嘉賓）/ member（會員）/ guest（來賓）/ surname（同姓）/ tag（會員標籤）' }, surname: { type: 'string', description: '姓氏，group=surname 時必填，例如 蘇/陳/李' }, tag: { type: 'string', description: '標籤名，group=tag 時必填，例如 素食、長老、需要翻譯' }, table_number: { type: 'string', description: '指定枱號（可選），由呢張枱開始排，唔夠位會自動開新枱' }, max_per_table: { type: 'integer', description: '每枱人數上限，預設12人' } }, required: ['group'] } } },
    { type: 'function', function: { name: 'move_table', description: '移動整枱人去另一張枱。適用指令如「把3號枱所有人移動到5號枱」「將第1枱嘅人搬去第2枱」。', parameters: { type: 'object', properties: { from_table: { type: 'string', description: '來源枱號' }, to_table: { type: 'string', description: '目標枱號' }, force: { type: 'boolean', description: '強制搬，超容量自動分到後續枱號' } }, required: ['from_table', 'to_table'] } } },
    { type: 'function', function: { name: 'list_tables', description: '查詢完整枱號地圖，包括每張枱嘅枱名、所有人名、座位次序、未排位名單、以及枱數統計', parameters: { type: 'object', properties: { meeting_id: { type: 'integer', description: '會議ID，預設最新會議' } }, required: [] } } },
    { type: 'function', function: { name: 'update_table_names', description: '設定枱名，例如將1號枱改名做「VIP枱」、2號枱改做「主家席」', parameters: { type: 'object', properties: { meeting_id: { type: 'integer', description: '會議ID' }, names: { type: 'object', description: '枱名 mapping，例如 {"1":"VIP枱","2":"主家席"}' } }, required: ['meeting_id', 'names'] } } },
    { type: 'function', function: { name: 'create_meeting', description: '新增會議', parameters: { type: 'object', properties: { date: { type: 'string', description: '日期 YYYY-MM-DD' }, type: { type: 'string', description: 'regular/special/anniversary' }, collector: { type: 'string' }, guest_fee: { type: 'integer' }, member_fee: { type: 'integer' }, committee_fee: { type: 'integer' }, early_bird_fee: { type: 'integer' }, walk_in_fee: { type: 'integer' } }, required: ['date'] } } },
    { type: 'function', function: { name: 'add_guest_to_meeting', description: '將一位來賓加入最新會議（建立來賓+attendance record）', parameters: { type: 'object', properties: { name: { type: 'string' }, professional: { type: 'string' }, tel: { type: 'string' }, invited_by: { type: 'string' }, vip: { type: 'integer', description: '1=VIP嘉賓' }, payment: { type: 'string', description: 'paid/free/unpaid' } }, required: ['name'] } } },
    { type: 'function', function: { name: 'add_person_to_meeting', description: '將已有會員或來賓加入最新會議', parameters: { type: 'object', properties: { person_type: { type: 'string', description: 'member 或 guest' }, person_id: { type: 'integer' }, payment: { type: 'string', description: 'paid/free/unpaid' }, table_number: { type: 'string' }, seat_order: { type: 'integer' } }, required: ['person_type', 'person_id'] } } },
    { type: 'function', function: { name: 'list_all_members', description: '列出所有活躍會員', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'list_all_guests', description: '列出所有活躍來賓', parameters: { type: 'object', properties: {}, required: [] } } },
    { type: 'function', function: { name: 'update_settings', description: '更新系統設定', parameters: { type: 'object', properties: { settings: { type: 'object', description: 'key-value 設定對照表' } }, required: ['settings'] } } },
    { type: 'function', function: { name: 'delete_meeting', description: '刪除會議及其所有出席記錄', parameters: { type: 'object', properties: { meeting_id: { type: 'integer' } }, required: ['meeting_id'] } } },
    { type: 'function', function: { name: 'generate_receipt', description: '收到付款資料後生成正式PDF收據並查詢付款人身份。當用戶提供姓名/電話/金額/日期等付款資訊，或說「出收據/開收據/整收據/paid/付款/generate receipt」時，必須使用此工具。一併處理：生成PDF+查詢資料庫匹配。', parameters: { type: 'object', properties: { name: { type: 'string', description: '付款人姓名' }, amount: { type: 'integer', description: '付款金額(HK$)' }, phone: { type: 'string', description: '電話號碼（可選）' }, date: { type: 'string', description: '日期（可選）例如 2026年7月15日' }, event: { type: 'string', description: '活動/事由名稱（可選）例如 四週年聚餐、例會' }, payment_method: { type: 'string', description: '付款方式：cash/FPS/PayMe/cheque（可選）' }, text: { type: 'string', description: '用戶原始輸入的全部文字' } }, required: [] } } }
  ];
}

export function getSystemPrompt() {
  return `你是火炭會聚會助理「龍蝦仔」🦞。用港式地道廣東話回覆，語氣親切風趣，似朋友WhatsApp傾計咁。每句1-2句，唔好太長。唔好用Markdown。

⚠️ 搜尋規則：當用戶要求搜尋、查詢、搵人、睇會員/來賓時，你必須調用 search_people function！唔准用「我幫你搵緊」敷衍！調用完後根據回傳結果列出名單。其他操作同樣：必須調用對應 function，唔准跳過！

格式規則：每筆資料之間用空行分隔（即兩個換行）。名單用「名｜專業｜電話」格式。一定要有分行！唔准全部黐埋一齊！
🔗 連結規則：generate_receipt 或其他工具回傳嘅下載連結，必須用 HTML <a> 標籤輸出，格式：<a href="連結" target="_blank">📥 撳呢度下載收據</a>。唔准只俾檔名、唔准改條link、唔准漏咗個 path！
🧾 收據 event 規則：
  - 如果用戶提到活動/聚餐/聚會名稱（如「四週年聚餐」「例會」「特別會議」），必須將活動名稱傳入 generate_receipt 嘅 event 參數。格式：「YYYY-MM-DD 活動名」（例：2026-07-30 例會）。
  - 如果用戶提供咗 meeting_id，必須先用 get_meetings 查詢該會議嘅 date 同 type/theme，然後將「日期 類型」組合成 event（例：meeting_id=5 → get_meetings → "2026-07-30 例會" → 傳入 event 參數）。
  - 只有喺用戶完全冇提活動名、又冇俾 meeting_id 嘅時候，先可以skip event。
  - EventName 喺收據 template 入面會被替換成你傳入嘅 event 字串，所以你一定要俾完整嘅日期+活動名。

火炭會：75會員 5來賓 | PayMe:payme.hsbc/fotan | WhatsApp:97188675
📋 匯入規則：用戶貼名單時，自動調用 bulk_add_guests。唔好填 meeting_id（等系統自動用最新會議）。唔好自己作任何 ID！格式：「姓名 專業 💰/未付」。
🔥 四週年聚餐：2026-06-20 沙田帝都酒店國穗軒1樓。11:30交流 12:55開場。
🍽 排位：任何涉及座位/枱號/排位嘅請求，你必須調用 list_tables / auto_seat / move_table / update_table_names function！唔准自己憑空作排位結果！調用完 function 之後先可以根據回傳結果回答。
- list_tables：查詢枱號地圖
- update_table_names：設定枱名（meeting_id + names JSON）
- auto_seat group: committee/vip/member/guest/surname/tag。vip=所有 vip=1 來賓
- move_table：移動整枱人（可加 force:true 強制搬）
- 每枱最多12人，超過會自動分多張枱

當前日期：${new Date().toISOString().split('T')[0]}`;
}

export async function executeFunction(env, name, args) {
  switch (name) {
    case 'get_meetings': {
      const rows = await env.DB.prepare('SELECT * FROM meetings ORDER BY date DESC LIMIT 10').all();
      return JSON.stringify(rows.results);
    }
    case 'get_attendance': {
      const mid = args.meeting_id;
      const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(mid).first();
      const att = await env.DB.prepare(
        "SELECT a.* FROM attendance a WHERE a.meeting_id=?"
      ).bind(mid).all();
      return JSON.stringify({ meeting, attendance: att.results });
    }
    case 'get_member_stats': {
      const total = await env.DB.prepare('SELECT COUNT(*) as c FROM members WHERE active=1').first();
      const guestCount = await env.DB.prepare('SELECT COUNT(*) as c FROM guests WHERE active=1').first();
      const lastMtg = await env.DB.prepare("SELECT * FROM meetings ORDER BY date DESC LIMIT 1").first();
      let attCount = 0;
      if (lastMtg) {
        const a = await env.DB.prepare('SELECT COUNT(*) as c FROM attendance WHERE meeting_id=?').bind(lastMtg.id).first();
        attCount = a.c;
      }
      return JSON.stringify({ member_count: total.c, guest_count: guestCount.c, last_meeting: lastMtg, last_attendance_count: attCount });
    }
    case 'search_people': {
      const q = '%'+args.query+'%';
      const members = await env.DB.prepare('SELECT id,name,tel,email FROM members WHERE name LIKE ? AND active=1 LIMIT 5').bind(q).all();
      const guests = await env.DB.prepare('SELECT id,name,tel,professional,invited_by FROM guests WHERE name LIKE ? AND active=1 LIMIT 5').bind(q).all();
      return JSON.stringify({ members: members.results, guests: guests.results });
    }
    case 'get_member_detail': {
      const mid = args.member_id;
      const member = await env.DB.prepare('SELECT * FROM members WHERE id=? AND active=1').bind(mid).first();
      if (!member) return JSON.stringify({ error: '找不到此會員' });
      const att = await env.DB.prepare(
        'SELECT a.*, m.date, m.type as meeting_type FROM attendance a JOIN meetings m ON a.meeting_id=m.id WHERE a.person_type=? AND a.person_id=? ORDER BY m.date DESC LIMIT 10'
      ).bind('member', mid).all();
      return JSON.stringify({ member, attendance: att.results });
    }
    case 'get_guest_list': {
      const guests = await env.DB.prepare('SELECT * FROM guests WHERE active=1 ORDER BY id').all();
      return JSON.stringify({ guests: guests.results, count: guests.results.length });
    }
    case 'get_payment_summary': {
      let mid = args.meeting_id;
      if (!mid) {
        const latest = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
        if (!latest) return JSON.stringify({ error: '沒有任何會議記錄' });
        mid = latest.id;
      }
      const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(mid).first();
      const checkedIn = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND arrival_time!='' AND arrival_time NOT LIKE 'absent|%'").bind(mid).first();
      const paid = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND payment='paid'").bind(mid).first();
      const unpaid = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND (payment='' OR payment='unpaid') AND arrival_time NOT LIKE 'absent|%'").bind(mid).first();
      const absent = await env.DB.prepare("SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND arrival_time LIKE 'absent|%'").bind(mid).first();
      return JSON.stringify({ meeting, checked_in: checkedIn.c, paid_count: paid.c, unpaid_count: unpaid.c, absent_count: absent.c });
    }
    case 'get_industry_list': {
      const guestProfessions = await env.DB.prepare("SELECT DISTINCT professional FROM guests WHERE active=1 AND professional!=''").all();
      const memberCount = await env.DB.prepare("SELECT COUNT(*) as c FROM members WHERE active=1").first();
      return JSON.stringify({ member_count: memberCount.c, guest_industries: guestProfessions.results.map(r => r.professional) });
    }
    case 'add_guest': {
      if (!args.name) return JSON.stringify({ error: '請提供來賓姓名' });
      // Check duplicate
      const existG = await env.DB.prepare('SELECT id FROM guests WHERE name=? AND active=1').bind(args.name).first();
      const existM = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(args.name).first();
      if (existG || existM) return JSON.stringify({ error: '已存在：' + args.name + '（會員或來賓中重複）' });
      let mid = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
      mid = mid ? mid.id : null;
      const result = await env.DB.prepare('INSERT INTO guests (name, professional, tel, invited_by, meeting_id, vip) VALUES (?,?,?,?,?,?)')
        .bind(args.name, args.professional || '', args.tel || '', args.invited_by || '', mid, args.vip ? 1 : 0).run();
      if (mid) {
        await env.DB.prepare('INSERT INTO attendance (meeting_id, person_type, person_id, payment) VALUES (?,?,?,?)')
          .bind(mid, 'guest', result.meta.last_row_id, '').run();
      }
      return JSON.stringify({ ok: true, message: '已新增來賓：' + args.name + '（會議#' + mid + '）' });
    }
    case 'bulk_add_guests': {
      const guestList = args.guests || [];
      if (!guestList.length) return JSON.stringify({ error: '請提供來賓名單' });
      // Validate meeting_id — always prefer latest meeting
      let mid = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
      mid = mid ? mid.id : null;
      if (args.meeting_id) {
        const check = await env.DB.prepare('SELECT id FROM meetings WHERE id=?').bind(args.meeting_id).first();
        if (!check) return JSON.stringify({ error: '會議 ID ' + args.meeting_id + ' 不存在，請唔好自己作 ID。最新會議係 #' + mid });
        mid = args.meeting_id;
      }
      if (!mid) return JSON.stringify({ error: '未有會議，請先建立會議' });
      let added = 0, skipped = 0, paid = 0, unpaid = 0;
      for (const g of guestList) {
        const name = String(g.name || '').trim();
        if (!name) continue;
        // Check for duplicate in both guests and members
        const existGuest = await env.DB.prepare('SELECT id FROM guests WHERE name=? AND active=1').bind(name).first();
        const existMember = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
        if (existGuest || existMember) { skipped++; continue; }
        const result = await env.DB.prepare('INSERT INTO guests (name, professional, tel, invited_by, meeting_id, vip) VALUES (?,?,?,?,?,?)')
          .bind(name, g.professional || '', g.tel || '', g.invited_by || '', mid, g.vip ? 1 : 0).run();
        const guestId = result.meta.last_row_id;
        // Create attendance record with payment status if meeting_id is set
        if (mid) {
          const isPaid = g.payment === 'paid' || g.payment === true || String(g.payment).includes('paid') || String(g.payment).includes('已付');
          const payStatus = isPaid ? 'paid' : '';
          await env.DB.prepare('INSERT INTO attendance (meeting_id, person_type, person_id, payment) VALUES (?,?,?,?)')
            .bind(mid, 'guest', guestId, payStatus).run();
          if (isPaid) paid++; else unpaid++;
        }
        added++;
      }
      return JSON.stringify({ ok: true, message: '已匯入 ' + added + ' 位來賓（跳過 ' + skipped + ' 位重複）', added, skipped, paid_count: paid, unpaid_count: unpaid, meeting_id: mid });
    }
    case 'add_meeting': {
      if (!args.date || !args.type) return JSON.stringify({ error: '請提供日期和類型' });
      await env.DB.prepare('INSERT INTO meetings (date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee) VALUES (?,?,?,?,?,?,?,?)')
        .bind(args.date, args.type, args.collector || '', args.guest_fee || 0, args.member_fee || 0, args.committee_fee || 0, args.early_bird_fee || 0, args.walk_in_fee || 0).run();
      return JSON.stringify({ ok: true, message: '已新增會議：' + args.date });
    }
    case 'update_payment': {
      const validPayments = ['paid', 'free', 'unpaid', ''];
      if (!validPayments.includes(args.payment)) return JSON.stringify({ error: 'payment 必須為 paid/free/unpaid' });
      await env.DB.prepare('UPDATE attendance SET payment=? WHERE id=?').bind(args.payment, args.attendance_id).run();
      return JSON.stringify({ ok: true, message: '已更新付款狀態為 ' + args.payment });
    }
    case 'update_table': {
      const sets = [], vals = [];
      if (args.table_number !== undefined) { sets.push('table_number=?'); vals.push(args.table_number || ''); }
      if (args.seat_order !== undefined) { sets.push('seat_order=?'); vals.push(args.seat_order); }
      if (!sets.length) return JSON.stringify({ error: '請提供 table_number 或 seat_order' });
      vals.push(args.meeting_id, args.person_type, args.person_id);
      await env.DB.prepare(
        'UPDATE attendance SET ' + sets.join(',') + ' WHERE meeting_id=? AND person_type=? AND person_id=?'
      ).bind(...vals).run();
      return JSON.stringify({ ok: true, message: '已更新枱號/座位' });
    }
    case 'mark_arrival': {
      const isAbsent2 = args.arrival_time === 'absent' || (args.arrival_time && args.arrival_time.startsWith && args.arrival_time.startsWith('absent|'));
      // 未付款不能簽到
      if (args.arrival_time && !isAbsent2) {
        const row = await env.DB.prepare('SELECT payment FROM attendance WHERE id=?').bind(args.attendance_id).first();
        if (!row || (row.payment !== 'paid' && row.payment !== 'free')) {
          return JSON.stringify({ ok: false, message: '未付款不能簽到，請先更新付款狀態' });
        }
      }
      const absentVal2 = 'absent|' + new Date().toISOString();
      await env.DB.prepare('UPDATE attendance SET arrival_time=? WHERE id=?')
        .bind(args.arrival_time && !isAbsent2 ? args.arrival_time : absentVal2, args.attendance_id).run();
      return JSON.stringify({ ok: true, message: '已標記為 ' + (args.arrival_time && !isAbsent2 ? args.arrival_time : '缺席') });
    }
    case 'get_settings': {
      const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      rows.results.forEach(r => { settings[r.key] = r.value; });
      return JSON.stringify({ ok: true, settings });
    }
    case 'delete_attendance': {
      await env.DB.prepare('DELETE FROM attendance WHERE id=?').bind(args.attendance_id).run();
      return JSON.stringify({ ok: true, message: '已刪除出席記錄 #' + args.attendance_id });
    }
    case 'get_receipts': {
      const rows = await env.DB.prepare(
        'SELECT id, filename, created_at FROM member_receipts WHERE member_id=? ORDER BY created_at DESC'
      ).bind(args.member_id).all();
      return JSON.stringify({ ok: true, receipts: rows.results, count: rows.results.length });
    }
    case 'create_member': {
      if (!args.name) return JSON.stringify({ error: '請提供會員姓名' });
      const exist = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(args.name).first();
      if (exist) return JSON.stringify({ error: '會員 ' + args.name + ' 已存在' });
      const result = await env.DB.prepare(
        'INSERT INTO members (name, tel, email, professional, role) VALUES (?,?,?,?,?)'
      ).bind(args.name, args.tel || '', args.email || '', args.professional || '', args.role || '會員').run();
      return JSON.stringify({ ok: true, message: '已新增會員：' + args.name, member_id: result.meta.last_row_id });
    }
    case 'update_member': {
      const fields = [];
      const values = [];
      for (const f of ['name','tel','email','professional','role','fee_paid_date','bio','tags','table_number','seat_order','active']) {
        if (args[f] !== undefined) { fields.push(f+'=?'); values.push(args[f]); }
      }
      if (!fields.length) return JSON.stringify({ error: '請提供要更新的欄位' });
      values.push(args.member_id);
      await env.DB.prepare('UPDATE members SET '+fields.join(',')+' WHERE id=?').bind(...values).run();
      return JSON.stringify({ ok: true, message: '已更新會員 #' + args.member_id });
    }
    case 'update_guest': {
      const fields = [];
      const values = [];
      for (const f of ['name','tel','professional','invited_by','vip','active']) {
        if (args[f] !== undefined) { fields.push(f+'=?'); values.push(args[f]); }
      }
      if (!fields.length) return JSON.stringify({ error: '請提供要更新的欄位' });
      values.push(args.guest_id);
      await env.DB.prepare('UPDATE guests SET '+fields.join(',')+' WHERE id=?').bind(...values).run();
      const action = args.active === 0 || args.active === '0' ? '已刪除來賓' : '已更新來賓';
      return JSON.stringify({ ok: true, message: action + ' #' + args.guest_id });
    }
    case 'bulk_create_members': {
      const memberList = args.members || [];
      if (!memberList.length) return JSON.stringify({ error: '請提供會員名單' });
      let added = 0, skipped = 0;
      for (const m of memberList) {
        const name = String(m.name || '').trim();
        if (!name) continue;
        const exist = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(name).first();
        if (exist) { skipped++; continue; }
        await env.DB.prepare(
          'INSERT INTO members (name, tel, email, professional, role, fee_paid_date) VALUES (?,?,?,?,?,?)'
        ).bind(name, m.tel || '', m.email || '', m.professional || '', m.role || '會員', m.fee_paid_date || '').run();
        added++;
      }
      return JSON.stringify({ ok: true, message: '已新增 ' + added + ' 位會員（跳過 ' + skipped + ' 位重複）', added, skipped });
    }
    case 'upload_image': {
      if (!args.name || !args.data) return JSON.stringify({ error: '請提供 name 和 data' });
      const base64 = args.data.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await env.R2.put(args.name, bytes, {
        httpMetadata: { contentType: args.content_type || 'image/png', cacheControl: 'public, max-age=86400' }
      });
      return JSON.stringify({ ok: true, message: '已上傳圖片：' + args.name, url: '/api/image?name=' + encodeURIComponent(args.name) });
    }
    case 'auto_seat': {
      const group = args.group;
      // Get latest meeting
      const latest = await env.DB.prepare('SELECT id, date FROM meetings ORDER BY date DESC LIMIT 1').first();
      if (!latest) return JSON.stringify({ error: '冇會議記錄' });
      const mid = latest.id;

      // Get attendance with person info
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
      att.results.forEach(function(p){
        if (group === 'committee') {
          if (p.role && p.role !== '會員') filtered.push(p);
        } else if (group === 'vip') {
          if (p.vip === 1) filtered.push(p);
        } else if (group === 'member') {
          if (p.person_type === 'member' && (!p.role || p.role === '會員')) filtered.push(p);
        } else if (group === 'surname') {
          if (args.surname && p.name && p.name.charAt(0) === args.surname) filtered.push(p);
        } else if (group === 'guest') {
          if (p.person_type === 'guest' && p.vip !== 1) filtered.push(p);
        } else if (group === 'tag') {
          if (args.tag && p.tags) {
            var tagList = p.tags.split(',').map(function(t){ return t.trim(); });
            if (tagList.indexOf(args.tag) !== -1) filtered.push(p);
          }
        }
      });

      if (!filtered.length) {
        var desc = group==='committee'?'委員':(group==='vip'?'VIP嘉賓':(group==='surname'?'姓'+args.surname+'嘅人':(group==='member'?'會員':(group==='tag'?'標籤「'+args.tag+'」嘅人':'來賓'))));
        return JSON.stringify({ ok: false, message: '搵唔到任何'+desc });
      }

      // Find empty tables or use next available numbers
      var maxPerTable = parseInt(args.max_per_table) || 12;
      var usedTables = new Set();
      var tablePeople = {}; // table_number -> [person]
      att.results.forEach(function(a){ if (a.table_number) { usedTables.add(String(a.table_number)); if (!tablePeople[a.table_number]) tablePeople[a.table_number] = []; tablePeople[a.table_number].push(a); } });

      // Find available table numbers — prefer partially-filled tables first, then empty ones
      var existingTableNums = Object.keys(tablePeople).sort(function(a,b){ return parseInt(a)-parseInt(b); });
      var maxExistingTbl = existingTableNums.length ? Math.max.apply(null, existingTableNums.map(Number)) : 0;

      function nextFreeTable(startFrom) {
        // 1. FIRST: find completely EMPTY table (no existing people)
        for (var i=Math.max(startFrom,1); i<=Math.max(maxExistingTbl, 1); i++) {
          var t = String(i);
          if (!tablePeople[t] || tablePeople[t].length === 0) return t;
        }
        // 2. SECOND: if all tables have at least 1 person, create new number
        // Never mix groups into tables that already have people
        return String(maxExistingTbl + 1);
      }

      // Assign people to tables, splitting if needed
      var assignments = []; // {table, people:[]}
      var specifiedTbl = args.table_number || '';
      var currentTbl = specifiedTbl || nextFreeTable(1);
      var currentBatch = [];
      var batchNames = [];

      filtered.forEach(function(p){
        currentBatch.push(p);
        batchNames.push(p.name);
        if (currentBatch.length >= maxPerTable) {
          assignments.push({table: currentTbl, people: currentBatch, names: batchNames});
          currentBatch = [];
          batchNames = [];
          currentTbl = nextFreeTable(parseInt(currentTbl)+1);
        }
      });
      if (currentBatch.length > 0) {
        assignments.push({table: currentTbl, people: currentBatch, names: batchNames});
      }

      // If user specified a table but it's already occupied, append to next tables
      if (specifiedTbl) {
        var existing = tablePeople[specifiedTbl] || [];
        if (existing.length + filtered.length > maxPerTable) {
          // Need to split: fill specified table first, then overflow to next tables
          // Already handled by the splitting logic above
        }
      }

      // Batch update — assign seat_order by position within each table
      var allUpdates = [];
      var summary = [];
      assignments.forEach(function(asgn){
        asgn.people.forEach(function(p, si){
          var seat = si + 1;
          allUpdates.push(
            env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.att_id).run()
          );
          allUpdates.push(
            p.person_type === 'member' ?
              env.DB.prepare('UPDATE members SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.person_id).run() :
              env.DB.prepare('UPDATE guests SET table_number=?, seat_order=? WHERE id=?').bind(asgn.table, seat, p.person_id).run()
          );
        });
        summary.push('🍽 第'+asgn.table+'號枱：'+asgn.names.join('、'));
      });
      await Promise.all(allUpdates);

      var groupDesc = group==='committee'?'委員':(group==='vip'?'VIP嘉賓':(group==='surname'?'姓'+args.surname+'嘅人':(group==='member'?'會員':(group==='tag'?'標籤「'+args.tag+'」嘅人':'來賓'))));
      var meetingInfo = '📅'+latest.date+' '+(latest.type==='anniversary'?'週年聚餐':(latest.type==='special'?'特別會議':'例會'));

      return JSON.stringify({
        ok: true,
        message: '✅ ' + meetingInfo + '\n已將 ' + filtered.length + ' 位' + groupDesc + '排好位！\n' + summary.join('\n') + '\n\n💡 提示：請喺「餐桌排位」頁面按 F5 重新整理睇結果。',
        meeting_id: mid,
        meeting_date: latest.date,
        people: filtered.map(function(p){return p.name;}).join('、'),
        tables: assignments.map(function(a){return a.table;}),
        count: filtered.length
      });
    }
    case 'move_table': {
      var fromTbl = args.from_table;
      var toTbl = args.to_table;
      var maxPerTbl = parseInt(args.max_per_table) || 12;
      if (!fromTbl || !toTbl) return JSON.stringify({ error: '請提供 from_table 同 to_table' });
      var latest2 = await env.DB.prepare('SELECT id, date FROM meetings ORDER BY date DESC LIMIT 1').first();
      if (!latest2) return JSON.stringify({ error: '冇會議記錄' });
      var mid2 = latest2.id;

      // Count existing people on target table
      var existing = await env.DB.prepare('SELECT COUNT(*) as c FROM attendance WHERE meeting_id=? AND table_number=?').bind(mid2, toTbl).first();
      var existingCount = existing ? existing.c : 0;
      var available = maxPerTbl - existingCount;

      // Find all people on the source table
      var people2 = await env.DB.prepare(
        'SELECT a.id as att_id, a.person_type, a.person_id, CASE WHEN a.person_type=\'member\' THEN m.name ELSE g.name END as name FROM attendance a LEFT JOIN members m ON a.person_type=\'member\' AND a.person_id=m.id LEFT JOIN guests g ON a.person_type=\'guest\' AND a.person_id=g.id WHERE a.meeting_id=? AND a.table_number=?'
      ).bind(mid2, fromTbl).all();

      if (!people2.results.length) return JSON.stringify({ ok: false, message: '第'+fromTbl+'號枱冇人喎！' });

      // Check capacity
      var moves = [];
      var fit = people2.results.slice(0, Math.max(0, available));
      var overflow = people2.results.slice(Math.max(0, available));
      var message = '';

      fit.forEach(function(p){
        moves.push(env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=NULL WHERE id=?').bind(toTbl, p.att_id).run());
        moves.push(p.person_type === 'member' ?
          env.DB.prepare('UPDATE members SET table_number=? WHERE id=?').bind(toTbl, p.person_id).run() :
          env.DB.prepare('UPDATE guests SET table_number=? WHERE id=?').bind(toTbl, p.person_id).run());
      });

      if (overflow.length > 0 && !args.force) {
        // Don't move overflow - leave them on original table
        message = '⚠️ 第'+toTbl+'號枱只能容納 '+maxPerTbl+' 人（已有 '+existingCount+' 人，剩 '+available+' 位）。已搬 '+fit.length+' 人，第'+fromTbl+'號枱仲有 '+overflow.length+' 人因爆滿未搬。';
      } else if (overflow.length > 0 && args.force) {
        // Force move overflow to next available tables
        var overflowMsgs = [];
        for (var k=0; k<overflow.length; k+=maxPerTbl) {
          var batch = overflow.slice(k, k+maxPerTbl);
          var nextTbl = String(parseInt(toTbl) + 1 + Math.floor(k/maxPerTbl));
          var batchNames = [];
          batch.forEach(function(p){
            batchNames.push(p.name);
            moves.push(env.DB.prepare('UPDATE attendance SET table_number=?, seat_order=NULL WHERE id=?').bind(nextTbl, p.att_id).run());
            moves.push(p.person_type === 'member' ?
              env.DB.prepare('UPDATE members SET table_number=? WHERE id=?').bind(nextTbl, p.person_id).run() :
              env.DB.prepare('UPDATE guests SET table_number=? WHERE id=?').bind(nextTbl, p.person_id).run());
          });
          overflowMsgs.push('🍽 第'+nextTbl+'號枱：'+batchNames.join('、'));
        }
        message = '✅ 已將第'+fromTbl+'號枱 '+people2.results.length+' 人搬走！\n第'+toTbl+'號枱已滿 ('+maxPerTbl+'人)\n'+overflowMsgs.join('\n');
      }

      await Promise.all(moves);
      var meetingInfo2 = '('+latest2.date+') ';
      if (!message) {
        var names2 = people2.results.map(function(p){return p.name;}).join('、');
        message = meetingInfo2+'✅ 已將第'+fromTbl+'號枱 '+people2.results.length+' 人全部搬去第'+toTbl+'號枱！\n'+names2+'\n\n✨ 餐桌排位頁面會自動更新。';
      } else {
        message = meetingInfo2 + message + '\n\n✨ 餐桌排位頁面會自動更新。';
      }

      return JSON.stringify({ ok: true, message: message, meeting_date: latest2.date, moved: fit.length, overflow: overflow.length, count: people2.results.length });
    }
    case 'create_meeting': {
      if (!args.date) return JSON.stringify({ error: '請提供日期' });
      await env.DB.prepare('INSERT INTO meetings (date, type, collector, guest_fee, member_fee, committee_fee, early_bird_fee, walk_in_fee) VALUES (?,?,?,?,?,?,?,?)')
        .bind(args.date, args.type || 'regular', args.collector || '', args.guest_fee || 0, args.member_fee || 0, args.committee_fee || 0, args.early_bird_fee || 0, args.walk_in_fee || 0).run();
      return JSON.stringify({ ok: true, message: '已建立會議：' + args.date });
    }
    case 'add_guest_to_meeting': {
      if (!args.name) return JSON.stringify({ error: '請提供來賓姓名' });
      const existG3 = await env.DB.prepare('SELECT id FROM guests WHERE name=? AND active=1').bind(args.name).first();
      const existM3 = await env.DB.prepare('SELECT id FROM members WHERE name=? AND active=1').bind(args.name).first();
      if (existG3 || existM3) return JSON.stringify({ error: args.name + ' 已存在' });
      let mid3 = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
      mid3 = mid3 ? mid3.id : null;
      if (!mid3) return JSON.stringify({ error: '冇會議' });
      const r3 = await env.DB.prepare('INSERT INTO guests (name, professional, tel, invited_by, meeting_id, vip) VALUES (?,?,?,?,?,?)')
        .bind(args.name, args.professional || '', args.tel || '', args.invited_by || '', mid3, args.vip ? 1 : 0).run();
      await env.DB.prepare('INSERT INTO attendance (meeting_id, person_type, person_id, payment) VALUES (?,?,?,?)')
        .bind(mid3, 'guest', r3.meta.last_row_id, args.payment || '').run();
      return JSON.stringify({ ok: true, message: '已新增來賓：' + args.name + '（已加入會議 #' + mid3 + '）' });
    }
    case 'add_person_to_meeting': {
      if (!args.person_type || !args.person_id) return JSON.stringify({ error: '請提供 person_type 同 person_id' });
      let mid4 = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
      mid4 = mid4 ? mid4.id : null;
      if (!mid4) return JSON.stringify({ error: '冇會議' });
      const exist4 = await env.DB.prepare('SELECT id FROM attendance WHERE meeting_id=? AND person_type=? AND person_id=?').bind(mid4, args.person_type, args.person_id).first();
      if (exist4) return JSON.stringify({ error: '此人已在會議中 (attendance #' + exist4.id + ')' });
      const r4 = await env.DB.prepare('INSERT INTO attendance (meeting_id, person_type, person_id, payment, table_number, seat_order) VALUES (?,?,?,?,?,?)')
        .bind(mid4, args.person_type, args.person_id, args.payment || '', args.table_number || '', args.seat_order ?? null).run();
      return JSON.stringify({ ok: true, message: '已加入會議', attendance_id: r4.meta.last_row_id });
    }
    case 'list_all_members': {
      const rows = await env.DB.prepare('SELECT id, name, tel, professional, role, tags FROM members WHERE active=1 ORDER BY id').all();
      return JSON.stringify({ ok: true, members: rows.results, count: rows.results.length });
    }
    case 'list_all_guests': {
      const rows = await env.DB.prepare('SELECT id, name, tel, professional, invited_by, vip FROM guests WHERE active=1 ORDER BY id').all();
      return JSON.stringify({ ok: true, guests: rows.results, count: rows.results.length });
    }
    case 'list_tables': {
      let mid2 = args.meeting_id;
      if (!mid2) {
        const latest2 = await env.DB.prepare('SELECT id FROM meetings ORDER BY date DESC LIMIT 1').first();
        mid2 = latest2 ? latest2.id : null;
      }
      if (!mid2) return JSON.stringify({ error: '冇會議記錄' });
      const rows2 = await env.DB.prepare(`
        SELECT a.id as att_id, a.person_type, a.person_id, a.payment, a.table_number, a.seat_order,
          CASE WHEN a.person_type='member' THEN m.name ELSE g.name END as name,
          CASE WHEN a.person_type='member' THEN m.professional ELSE g.professional END as professional,
          CASE WHEN a.person_type='member' THEN (m.role IS NOT NULL AND m.role != '會員') ELSE 0 END as is_committee,
          CASE WHEN a.person_type='guest' THEN g.vip ELSE 0 END as vip
        FROM attendance a
        LEFT JOIN members m ON a.person_type='member' AND a.person_id=m.id
        LEFT JOIN guests g ON a.person_type='guest' AND a.person_id=g.id
        WHERE a.meeting_id=?
        ORDER BY CAST(a.table_number AS INTEGER), a.seat_order
      `).bind(mid2).all();
      const settingRow2 = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind('seating_names_' + mid2).first();
      let tableNames2 = {};
      if (settingRow2) { try { tableNames2 = JSON.parse(settingRow2.value); } catch(e) {} }
      const countRow2 = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind('seating_table_count_' + mid2).first();
      const tableCount2 = countRow2 ? parseInt(countRow2.value) || 0 : 0;
      const tables2 = {};
      const unassigned2 = [];
      for (const a of rows2.results) {
        const t = a.table_number || '';
        if (!t) { unassigned2.push(a); continue; }
        if (!tables2[t]) tables2[t] = { table_number: t, name: tableNames2[t] || ('第 ' + t + ' 號枱'), people: [] };
        tables2[t].people.push(a);
      }
      const nums = Object.keys(tables2).map(Number);
      const maxN = nums.length ? Math.max(...nums) : 0;
      const effCount = Math.max(maxN, tableCount2, 0);
      for (let i = 1; i <= effCount; i++) {
        if (!tables2[String(i)]) tables2[String(i)] = { table_number: String(i), name: tableNames2[String(i)] || ('第 ' + i + ' 號枱'), people: [] };
      }
      const tblList = Object.keys(tables2).sort((a,b) => parseInt(a)-parseInt(b)).map(k => tables2[k]);
      return JSON.stringify({
        ok: true, meeting_id: mid2, table_count: tblList.length,
        total_people: rows2.results.length, assigned_people: rows2.results.length - unassigned2.length, unassigned_people: unassigned2.length,
        tables: tblList, unassigned: unassigned2
      });
    }
    case 'update_table_names': {
      if (!args.meeting_id) return JSON.stringify({ error: '請提供 meeting_id' });
      if (!args.names || typeof args.names !== 'object') return JSON.stringify({ error: '請提供 names object' });
      const key2 = 'seating_names_' + args.meeting_id;
      const value2 = JSON.stringify(args.names);
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').bind(key2, value2, value2).run();
      return JSON.stringify({ ok: true, message: '已更新 ' + Object.keys(args.names).length + ' 張枱名稱', table_names: args.names });
    }
    case 'delete_meeting': {
      if (!args.meeting_id) return JSON.stringify({ error: '請提供 meeting_id' });
      await env.DB.prepare('DELETE FROM attendance WHERE meeting_id=?').bind(args.meeting_id).run();
      await env.DB.prepare('DELETE FROM meetings WHERE id=?').bind(args.meeting_id).run();
      return JSON.stringify({ ok: true, message: '已刪除會議 #' + args.meeting_id });
    }
    case 'generate_receipt': {
      // ── Direct HTML template fill — only name required ──
      let { name, amount, phone, date, event, text, payment_method } = args;
      // Parse from natural language text if fields not explicitly provided
      if (text && !name) {
        let m = text.match(/(.+?)\s*(?:paid|已付|付款)\s*\$?(\d+)/i);
        if (!m) m = text.match(/(\S+)\s+(\d{8})\s+(\d{1,2}月\d{1,2})\s+(\d+)\s*元?/);
        if (!m) m = text.match(/(.+?)\s+(\d+)\s*元?\s*$/);
        if (!m) m = text.match(/^(.+?)\s*$/);
        if (m) {
          name = name || m[1].trim();
          if (!amount && m.length > 2) amount = parseInt(m[m.length-1].match(/\d+/)?.[0] || m[2]);
          if (!phone && text.match(/(\d{8})/)) phone = RegExp.$1;
        }
      }
      // Detect payment method from text (only if not already provided as direct arg)
      if (!payment_method && text) {
        if (text.match(/現金|cash/i)) payment_method = 'cash';
        else if (text.match(/payme/i)) payment_method = 'PayMe';
        else if (text.match(/fps|轉數快/i)) payment_method = 'FPS';
        else if (text.match(/支票|cheque|check/i)) payment_method = 'cheque';
      }
      // Extract cheque details if payment method is cheque
      let chequeNo = args.chequeNo || '';
      let bankName = args.bankName || '';
      if (text && payment_method === 'cheque') {
        if (!chequeNo) {
          const cnMatch = text.match(/(?:支票號碼|Cheque\s*NO?[.:]?|支票\s*NO?[.:]?)\s*[:#]?\s*(\d+)/i);
          if (cnMatch) chequeNo = cnMatch[1];
        }
        if (!bankName) {
          const bnMatch = text.match(/(?:付款銀行|Bank|銀行)\s*[:.]?\s*(.+?)(?:\s*$|\s*\n)/i);
          if (bnMatch) bankName = bnMatch[1].trim();
        }
      }
      // Auto-generate receipt number from counter (args.receipt_no can override)
      let receipt_no = args.receipt_no || await getNextReceiptNumber(env);
      if (!name) return JSON.stringify({ error: '請提供付款人姓名，例如：陳大文' });

      try {
        const templateHtml = await getHtmlTemplate(env);
        if (!templateHtml) return JSON.stringify({ error: 'HTML receipt template not available' });

        let dd = '', mm = '', yyyy = '';
        if (date) {
          const d = parseDate(date) || date;
          const parts = String(d).split('-');
          if (parts.length === 3) { yyyy = parts[0]; mm = parts[1]; dd = parts[2]; }
          else { dd = String(d).substring(0, 10); }
        }

        const filledHtml = fillReceiptHtml(templateHtml, {
          name: name || '',
          dd, mm, yyyy,
          amount: String(amount || ''),
          event: event || '',
          receiptNo: receipt_no,
          paymentMethod: payment_method || '',
          chequeNo, bankName
        });

        // Convert filled HTML to PDF via local pdf-worker
        const pdfBytes = await convertHtmlToPdf(filledHtml);
        if (!pdfBytes) return JSON.stringify({ error: 'PDF conversion failed — is pdf-worker running on port 3000?' });

        const r2Key = 'receipts/receipt-' + receipt_no + '.pdf';
        await env.R2.put(r2Key, pdfBytes, {
          httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-cache' }
        });

        const downloadUrl = '/api/image?name=' + encodeURIComponent(r2Key) + '&download=1';
        const methodLabel = payment_method === 'cash' ? '💵現金' : (payment_method === 'PayMe' ? '💳PayMe' : (payment_method === 'FPS' ? '🔁FPS轉數快' : (payment_method === 'cheque' ? '📝支票' : (payment_method || ''))));

        let lookupInfo = '';
        try {
          const lr = JSON.parse(await executeFunction(env, 'lookup_payer', { search_name: name, search_tel: phone || '', amount }));
          if (lr.ok && lr.found && lr.people?.length > 0) {
            const p = lr.people[0];
            lookupInfo = '\n📋 資料庫匹配：' + p.name + ' | ' + p.tel + ' | ' + p.person_type + ' | ' + (p.payment_status==='paid'?'✅已付':p.payment_status==='free'?'🆓免費':'❌未付');
          }
        } catch(e) {}

        return JSON.stringify({
          ok: true,
          name, amount, payment_method,
          receipt_no: receipt_no,
          download_url: downloadUrl,
          message: '🧾 收據已生成！#' + receipt_no + ' — ' + name + (amount ? ' 港幣$' + amount : '') + (methodLabel ? '｜' + methodLabel : '') + lookupInfo + '\n📥 ' + downloadUrl
        });
      } catch (e) {
        return JSON.stringify({ error: '收據生成失敗：' + e.message });
      }
    }
    case 'generate_receipt_image': {
      // ── Direct HTML template fill (AI填表) — only name required ──
      let { name: name2, amount: amount2, date: date2, event: event2, payment_method, receipt_no, text: text2 } = args;
      if (text2 && !name2) {
        let m = text2.match(/(.+?)\s*(?:paid|已付|付款)\s*\$?(\d+)/i);
        if (!m) m = text2.match(/(\S+)\s+(\d{8})\s+(\d{1,2}月\d{1,2})\s+(\d+)\s*元?/);
        if (!m) m = text2.match(/(.+?)\s+(\d+)\s*元?\s*$/);
        if (!m) m = text2.match(/^(.+?)\s*$/);
        if (m) {
          name2 = name2 || m[1].trim();
          if (!amount2 && m.length > 2) amount2 = parseInt(m[m.length-1].match(/\d+/)?.[0] || m[2]);
          if (!payment_method && text2.match(/現金|cash/i)) payment_method = 'cash';
          if (!payment_method && text2.match(/payme/i)) payment_method = 'PayMe';
          if (!payment_method && text2.match(/fps|轉數快/i)) payment_method = 'FPS';
        }
      }
      if (text2) {
        if (!payment_method && text2.match(/payme/i)) payment_method = 'PayMe';
        if (!payment_method && text2.match(/fps|轉數快/i)) payment_method = 'FPS';
        if (!payment_method && text2.match(/現金|cash/i)) payment_method = 'cash';
        if (!payment_method && text2.match(/支票|cheque|check/i)) payment_method = 'cheque';
      }
      // Extract cheque details if payment method is cheque
      let chequeNo2 = args.chequeNo || '';
      let bankName2 = args.bankName || '';
      if (text2 && payment_method === 'cheque') {
        if (!chequeNo2) {
          const cnMatch = text2.match(/(?:支票號碼|Cheque\s*NO?[.:]?|支票\s*NO?[.:]?)\s*[:#]?\s*(\d+)/i);
          if (cnMatch) chequeNo2 = cnMatch[1];
        }
        if (!bankName2) {
          const bnMatch = text2.match(/(?:付款銀行|Bank|銀行)\s*[:.]?\s*(.+?)(?:\s*$|\s*\n)/i);
          if (bnMatch) bankName2 = bnMatch[1].trim();
        }
      }
      // Auto-generate receipt number from counter (args.receipt_no can override)
      if (!receipt_no) receipt_no = await getNextReceiptNumber(env);
      if (!name2) {
        return JSON.stringify({ error: '請提供付款人姓名。例如：AI填表 Ada Cheung' });
      }
      try {
        const templateHtml = await getHtmlTemplate(env);
        if (!templateHtml) return JSON.stringify({ error: 'HTML receipt template not available' });

        let dd = '', mm = '', yyyy = '';
        if (date2) {
          const d = parseDate(date2) || date2;
          const parts = String(d).split('-');
          if (parts.length === 3) { yyyy = parts[0]; mm = parts[1]; dd = parts[2]; }
          else { dd = String(d).substring(0, 10); }
        }

        const filledHtml = fillReceiptHtml(templateHtml, {
          name: name2 || '',
          dd, mm, yyyy,
          amount: String(amount2 || ''),
          event: event2 || '',
          receiptNo: receipt_no || '',
          paymentMethod: payment_method || '',
          chequeNo: chequeNo2, bankName: bankName2
        });

        // Convert filled HTML to PDF via local pdf-worker
        const pdfBytes = await convertHtmlToPdf(filledHtml);
        if (!pdfBytes) return JSON.stringify({ error: 'PDF conversion failed — is pdf-worker running on port 8080?' });

        const r2Key = 'receipts/receipt-' + (receipt_no || Date.now()) + '.pdf';
        await env.R2.put(r2Key, pdfBytes, {
          httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-cache' }
        });

        const downloadUrl = '/api/image?name=' + encodeURIComponent(r2Key) + '&download=1';
        const pmLower = (payment_method || '').toLowerCase();
        const methodLabel = pmLower === 'cash' ? '💵現金' : (pmLower === 'payme' ? '💳PayMe' : (pmLower === 'fps' ? '🔁FPS轉數快' : (pmLower === 'cheque' ? '📝支票' : (payment_method || 'FPS/PayMe'))));
        return JSON.stringify({
          ok: true,
          name: name2, amount: amount2,
          payment_method: payment_method || '',
          receipt_no: receipt_no || '',
          download_url: downloadUrl,
          message: '🖼️ AI填表收據已生成！#' + (receipt_no || '') + ' — ' + name2 + (amount2 ? ' 港幣$' + amount2 : '') + '｜' + methodLabel + '\n📥 ' + downloadUrl
        });
      } catch (e) {
        return JSON.stringify({ error: 'AI填表收據生成失敗：' + e.message });
      }
    }
    case 'lookup_payer': {
      const { search_name, search_tel, amount } = args;
      let results = [];
      // Search members by name or phone
      if (search_name || search_tel) {
        let memberSql = 'SELECT id, name, tel, professional, role, \'member\' as person_type FROM members WHERE active=1';
        const params = [];
        if (search_name) {
          memberSql += ' AND (name LIKE ? OR name LIKE ?)';
          params.push('%' + search_name + '%', '%' + search_name.replace(/\s/g, '') + '%');
        }
        if (search_tel) {
          const cleanTel = search_tel.replace(/[^0-9]/g, '');
          if (cleanTel.length >= 4) {
            memberSql += ' AND REPLACE(REPLACE(tel,\' \',\'\'),\'-\',\'\') LIKE ?';
            params.push('%' + cleanTel + '%');
          }
        }
        memberSql += ' LIMIT 10';
        const memberRows = await env.DB.prepare(memberSql).bind(...params).all();
        results.push(...memberRows.results.map(r => ({ ...r, person_type: 'member' })));

        // Search guests by name or phone
        let guestSql = 'SELECT id, name, tel, professional, \'guest\' as person_type FROM guests WHERE active=1';
        const gParams = [];
        if (search_name) {
          guestSql += ' AND (name LIKE ? OR name LIKE ?)';
          gParams.push('%' + search_name + '%', '%' + search_name.replace(/\s/g, '') + '%');
        }
        if (search_tel) {
          const cleanTel = search_tel.replace(/[^0-9]/g, '');
          if (cleanTel.length >= 4) {
            guestSql += ' AND REPLACE(REPLACE(tel,\' \',\'\'),\'-\',\'\') LIKE ?';
            gParams.push('%' + cleanTel + '%');
          }
        }
        guestSql += ' LIMIT 10';
        const guestRows = await env.DB.prepare(guestSql).bind(...gParams).all();
        results.push(...guestRows.results.map(r => ({ ...r, person_type: 'guest' })));
      }

      if (results.length === 0) {
        return JSON.stringify({
          ok: true,
          found: false,
          message: '找不到匹配的付款人。搜尋：' + (search_name || '') + ' ' + (search_tel || '') + '。請確認姓名或電話號碼是否正確，或手動在後台搜尋。',
          search_name, search_tel, amount
        });
      }

      // Get attendance info for found people
      const latestMeeting = await env.DB.prepare('SELECT id, date FROM meetings ORDER BY date DESC LIMIT 1').first();
      for (const p of results) {
        if (latestMeeting) {
          const att = await env.DB.prepare(
            'SELECT id, payment, payment_method, arrival_time, table_number FROM attendance WHERE meeting_id=? AND person_type=? AND person_id=?'
          ).bind(latestMeeting.id, p.person_type, p.id).first();
          p.attendance = att || null;
          p.meeting_date = latestMeeting.date;
        }
      }

      return JSON.stringify({
        ok: true,
        found: true,
        count: results.length,
        amount,
        search_name,
        search_tel,
        people: results.slice(0, 8).map(p => ({
          name: p.name,
          name_en: p.name, // Chinese name is the primary; English would be in professional or separate field
          tel: p.tel || '',
          professional: p.professional || '',
          person_type: p.person_type === 'member' ? '會員' : '來賓',
          role: p.role || '',
          payment_status: p.attendance?.payment || 'unknown',
          payment_method: p.attendance?.payment_method || '',
          arrival_time: p.attendance?.arrival_time || '',
          table_number: p.attendance?.table_number || '',
          meeting_date: p.meeting_date || ''
        })),
        message: '找到 ' + results.length + ' 位匹配的人員' + (amount ? '，金額 HK$' + amount : '')
      });
    }
    case 'update_settings': {
      if (!args.settings || typeof args.settings !== 'object') return JSON.stringify({ error: '請提供 settings object' });
      const stmts = [];
      for (const [k, v] of Object.entries(args.settings)) {
        stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').bind(k, String(v), String(v)));
      }
      await env.DB.batch(stmts);
      return JSON.stringify({ ok: true, message: '已更新 ' + Object.keys(args.settings).length + ' 項設定' });
    }
    case 'get_meeting_participants':
    case 'get_participants':
      return await executeFunction(env, 'get_attendance', args);
    default:
      return JSON.stringify({ error: '未知功能' });
  }
}

// Auto-generate receipt with PNG template background + text overlay
// Template coordinates (in 848×1264 px image space) — ADJUST to match your template
const TPL = {
  W: 848, H: 1264,
  receiptNo:  { x: 580, y: 110, size: 8 },  // after "No:" top-right
  payerName:  { x: 280, y: 420, size: 11 }, // "Receive from" row
  dateDD:     { x: 380, y: 540, size: 11 }, // Date: dd box
  dateMM:     { x: 460, y: 540, size: 11 }, // Date: mm box
  dateYYYY:   { x: 540, y: 540, size: 11 }, // Date: yyyy box
  amount:     { x: 420, y: 680, size: 11 }, // "Amount" row
  eventName:  { x: 280, y: 830, size: 11 }, // "Being in payment" row
};
function tplX(px) { return px * (595.28 / TPL.W); }
function tplY(py) { return 841.89 - py * (841.89 / TPL.H); }

// ── Receipt counter: 0000151–0000200, wraps back to 151 ──
async function getNextReceiptNumber(env) {
  let counterRow = await env.DB.prepare("SELECT value FROM settings WHERE key='receipt_counter'").first();
  let counter = counterRow ? parseInt(counterRow.value) : 151;
  if (isNaN(counter) || counter < 151 || counter > 200) counter = 151;
  const receiptNum = String(counter).padStart(7, '0');
  // Increment and save (wrap at 200 → 151)
  const nextCounter = counter >= 200 ? 151 : counter + 1;
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('receipt_counter', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
  ).bind(String(nextCounter), String(nextCounter)).run();
  return receiptNum;
}

async function generateReceiptDirect(env, name, amount, phone, date, event) {
  try {
    const receiptNum = await getNextReceiptNumber(env);
    const issueDate = date || new Date().toISOString().split('T')[0];

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    const { loadChineseFont } = await import('./font-loader.js');

    const PAGE_W = 595.28, PAGE_H = 841.89;
    const BLACK = rgb(0,0,0), BLUE = rgb(0.05, 0.15, 0.55);

    const bgBytes = await getBackgroundImage(env);

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    let chFont = null;
    try { const fd = await loadChineseFont(); chFont = await doc.embedFont(fd); } catch(e) {}
    const F = chFont;

    const page = doc.addPage([PAGE_W, PAGE_H]);

    if (bgBytes) {
      // Detect PNG vs JPG and embed as background
      const isPNG = bgBytes.length > 3 && bgBytes[1] === 0x50 && bgBytes[2] === 0x4E;
      const bgImage = isPNG ? await doc.embedPng(bgBytes) : await doc.embedJpg(bgBytes);
      page.drawImage(bgImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

      // ── Overlay text on template (skip fields with no data) ──
      if (F) {
        if (receiptNum) {
          page.drawText(receiptNum, { x: tplX(TPL.receiptNo.x), y: tplY(TPL.receiptNo.y), font: F, size: TPL.receiptNo.size, color: BLUE });
        }
        if (name) {
          page.drawText(String(name), { x: tplX(TPL.payerName.x), y: tplY(TPL.payerName.y), font: F, size: TPL.payerName.size, color: BLUE });
        }
        if (issueDate) {
          const parts = issueDate.split('-');
          if (parts.length === 3) {
            page.drawText(parts[2], { x: tplX(TPL.dateDD.x), y: tplY(TPL.dateDD.y), font: F, size: TPL.dateDD.size, color: BLUE });
            page.drawText(parts[1], { x: tplX(TPL.dateMM.x), y: tplY(TPL.dateMM.y), font: F, size: TPL.dateMM.size, color: BLUE });
            page.drawText(parts[0], { x: tplX(TPL.dateYYYY.x), y: tplY(TPL.dateYYYY.y), font: F, size: TPL.dateYYYY.size, color: BLUE });
          }
        }
        if (amount && !isNaN(amount)) {
          const amtStr = 'HK$ ' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          page.drawText(amtStr, { x: tplX(TPL.amount.x), y: tplY(TPL.amount.y), font: F, size: TPL.amount.size, color: BLUE });
        }
        if (event) {
          page.drawText(String(event), { x: tplX(TPL.eventName.x), y: tplY(TPL.eventName.y), font: F, size: TPL.eventName.size, color: BLUE });
        }
      }
    } else {
      // Fallback: draw receipt from scratch
      const GRAY = rgb(0.38,0.38,0.38), LIGHT = rgb(0.55,0.55,0.55);
      const GREEN = rgb(0.09,0.62,0.29);
      let helv = null;
      try { helv = await doc.embedFont(StandardFonts.Helvetica); } catch(e) {}
      const FB = helv || F;
      function pt(mm) { return mm * 2.8346457; }
      const M = 50;
      let y = PAGE_H - M;
      if (F) page.drawText('火炭會', { x: M, y, font: F, size: 11, color: GRAY });
      page.drawText('Fo Tan Chapter', { x: PAGE_W-M, y, font: FB, size: 8, color: LIGHT });
      y -= pt(12);
      if (F) page.drawText('付款收據', { x: PAGE_W/2, y, font: F, size: 24, color: GREEN });
      page.drawText('PAYMENT RECEIPT', { x: PAGE_W/2, y, font: FB, size: 14, color: GREEN });
      y -= pt(30);
      const rowH = pt(16);
      if (F) page.drawText('付款人: ' + (name || '—'), { x: M, y, font: F, size: 12, color: BLACK });
      y -= rowH;
      if (F) page.drawText('金額: HK$ ' + String(amount||0).replace(/\B(?=(\d{3})+(?!\d))/g, ','), { x: M, y, font: F, size: 12, color: BLACK });
      y -= rowH;
      if (F) page.drawText('日期: ' + (issueDate || '—'), { x: M, y, font: F, size: 12, color: BLACK });
      y -= rowH;
      if (event && F) page.drawText('事由: ' + event, { x: M, y, font: F, size: 12, color: BLACK });
    }

    const pdfBytes = await doc.save();
    const r2Key = 'receipts/receipt-' + receiptNum + '.pdf';
    await env.R2.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-cache' } });
    return r2Key;
  } catch(e) { console.error('generateReceiptDirect error:', e.message); return null; }
}

// Fetch receipt template background PNG from R2, auto-seeding from static assets in dev
async function getBackgroundImage(env) {
  const R2_KEY = 'templates/receipt-bg.png';
  const LOCAL_FILE = '火炭會receipt_template.png';
  try {
    const obj = await env.R2.get(R2_KEY);
    if (obj) return new Uint8Array(await obj.arrayBuffer());

    // Not in R2 — try to seed by fetching the static file
    try {
      const staticUrl = 'http://127.0.0.1:8787/' + encodeURIComponent(LOCAL_FILE);
      const resp = await fetch(staticUrl);
      if (resp.ok) {
        const data = new Uint8Array(await resp.arrayBuffer());
        await env.R2.put(R2_KEY, data, {
          httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' }
        });
        return data;
      }
    } catch (fetchErr) { /* not reachable */ }

    return null;
  } catch (e) { console.error('getBackgroundImage error:', e.message); return null; }
}

// ── Fetch HTML receipt template from R2 ──
async function getHtmlTemplate(env) {
  const R2_KEY = 'templates/fotanclub07.html';
  const LOCAL_FILE = 'fotanclub07.html';
  try {
    const obj = await env.R2.get(R2_KEY);
    if (obj) return new TextDecoder().decode(await obj.arrayBuffer());
    for (const port of [8788, 8787, 8789, 8790]) {
      try {
        const staticUrl = 'http://127.0.0.1:' + port + '/' + encodeURIComponent(LOCAL_FILE);
        const resp = await fetch(staticUrl);
        if (resp.ok) {
          const htmlText = await resp.text();
          await env.R2.put(R2_KEY, htmlText, {
            httpMetadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'public, max-age=86400' }
          });
          return htmlText;
        }
      } catch (fetchErr) { /* try next port */ }
    }
    return null;
  } catch (e) { console.error('getHtmlTemplate error:', e.message); return null; }
}

// ── Convert filled HTML to PDF via local pdf-worker ──
async function convertHtmlToPdf(html) {
  const PDF_WORKER_URL = 'http://127.0.0.1:3000';
  try {
    const resp = await fetch(PDF_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'PDF worker returned ' + resp.status);
    }
    return new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    console.error('convertHtmlToPdf error:', e.message);
    return null;
  }
}

// ── Parse natural language date strings ──
function parseDate(text) {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const s = String(text).trim();
  let m = s.match(/(\d+)(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*(\d{4})?/i);
  if (m) {
    const months = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const dd = String(parseInt(m[1])).padStart(2,'0');
    const mm = String(months[(m[2] || '').toLowerCase()] || 1).padStart(2,'0');
    const yyyy = m[3] || String(new Date().getFullYear());
    return yyyy + '-' + mm + '-' + dd;
  }
  m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日號]/);
  if (m) {
    const mm = String(parseInt(m[1])).padStart(2,'0');
    const dd = String(parseInt(m[2])).padStart(2,'0');
    return (new Date().getFullYear()) + '-' + mm + '-' + dd;
  }
  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return m[3] + '-' + String(parseInt(m[2])).padStart(2,'0') + '-' + String(parseInt(m[1])).padStart(2,'0');
  return null;
}

// ── Fill HTML receipt template with data ──
function fillReceiptHtml(templateHtml, data) {
  let html = templateHtml;

  // Payee name — replace "茲收到: Payee" with "茲收到: <name>"
  if (data.name) {
    html = html.replace('茲收到: Payee', '茲收到: ' + data.name);
  }

  // Date: dd, mm, yyyy — targeted by span class to avoid false matches
  // dd is inside <span class="pdf24_12 pdf24_08 pdf24_17" ...>dd </span>
  if (data.dd) html = html.replace('class="pdf24_12 pdf24_08 pdf24_17" style="word-spacing:0.5384em;">dd ', 'class="pdf24_12 pdf24_08 pdf24_17" style="word-spacing:0.5384em;">' + data.dd + ' ');
  // mm is inside <span class="pdf24_12 pdf24_08 pdf24_16" ...>mm </span>
  if (data.mm) html = html.replace('class="pdf24_12 pdf24_08 pdf24_16" style="word-spacing:0.5402em;">mm ', 'class="pdf24_12 pdf24_08 pdf24_16" style="word-spacing:0.5402em;">' + data.mm + ' ');
  // yyyy is inside <span class="pdf24_12 pdf24_08 pdf24_18" ...>yyyy </span>
  // Always fill yyyy: use provided year or current year
  const yyyyVal = data.yyyy || String(new Date().getFullYear());
  html = html.replace('class="pdf24_12 pdf24_08 pdf24_18" style="word-spacing:0.3169em;">yyyy ', 'class="pdf24_12 pdf24_08 pdf24_18" style="word-spacing:0.3169em;">' + yyyyVal + ' ');

  // Time
  const now = new Date();
  const hh = data.timeHH || String(now.getHours()).padStart(2, '0');
  const mmTime = data.timeMM || String(now.getMinutes()).padStart(2, '0');
  html = html.replace('>XX ', '>' + hh + ' ');
  html = html.replace('>ZZ ', '>' + mmTime + ' ');

  // Amount — remove "A" prefix and replace mountOfMoney with 港幣$ amount
  if (data.amount) {
    const amtStr = '港幣$' + String(data.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // Remove the "A" prefix span before mountOfMoney
    html = html.replace('class="pdf24_23 pdf24_24 pdf24_25">A</span><span class="pdf24_14 pdf24_15 pdf24_11">mountOfMoney', 'class="pdf24_23 pdf24_24 pdf24_25"></span><span class="pdf24_14 pdf24_15 pdf24_11">' + amtStr);
  }

  // Event
  if (data.event) html = html.replace('EventName', data.event);

  // Receipt number
  // Receipt number — replace 0000101 in <span class="pdf24_07 pdf24_08 pdf24_09">
  if (data.receiptNo) html = html.replace('class="pdf24_07 pdf24_08 pdf24_09">No:0000101', 'class="pdf24_07 pdf24_08 pdf24_09">No:' + data.receiptNo);

  // Payment method checkbox — replace ☐ with ☑ in <span class="pdf24_30 pdf24_15 pdf24_27">
  if (data.paymentMethod) {
    const pm = data.paymentMethod.toLowerCase();
    if (pm === 'cash') html = html.replace('class="pdf24_30 pdf24_15 pdf24_27">☐</span><span class="pdf24_14 pdf24_15 pdf24_27">現金', 'class="pdf24_30 pdf24_15 pdf24_27">☑</span><span class="pdf24_14 pdf24_15 pdf24_27">現金');
    else if (pm === 'fps') html = html.replace('class="pdf24_30 pdf24_15 pdf24_27">☐</span><span class="pdf24_14 pdf24_15 pdf24_27">轉數快', 'class="pdf24_30 pdf24_15 pdf24_27">☑</span><span class="pdf24_14 pdf24_15 pdf24_27">轉數快');
    else if (pm === 'payme') html = html.replace('class="pdf24_30 pdf24_15 pdf24_27" style="word-spacing:0.3478em;">☐ </span><span class="pdf24_23 pdf24_24 pdf24_25">PayMe', 'class="pdf24_30 pdf24_15 pdf24_27" style="word-spacing:0.3478em;">☑ </span><span class="pdf24_23 pdf24_24 pdf24_25">PayMe');
    else if (pm === 'cheque') html = html.replace('/Cheque NO.:', '/Cheque NO.: X');
  }

  // Cheque details — only fill when payment method is cheque, else remove placeholders
  const isCheque = data.paymentMethod && data.paymentMethod.toLowerCase() === 'cheque';
  if (isCheque) {
    if (data.chequeNo) {
      html = html.replace('class="pdf24_33 pdf24_24 pdf24_34">cNo', 'class="pdf24_33 pdf24_24 pdf24_34">' + data.chequeNo);
    } else {
      html = html.replace('class="pdf24_33 pdf24_24 pdf24_34">cNo &nbsp;', 'class="pdf24_33 pdf24_24 pdf24_34">');
    }
    if (data.bankName) {
      html = html.replace('class="pdf24_12 pdf24_08 pdf24_36">BName', 'class="pdf24_12 pdf24_08 pdf24_36">' + data.bankName);
    } else {
      html = html.replace('class="pdf24_12 pdf24_08 pdf24_36">BName &nbsp;', 'class="pdf24_12 pdf24_08 pdf24_36">');
    }
  } else {
    // Not paying by cheque — strip both cheque rows
    html = html.replace('class="pdf24_33 pdf24_24 pdf24_34">cNo &nbsp;', 'class="pdf24_33 pdf24_24 pdf24_34">');
    html = html.replace('class="pdf24_12 pdf24_08 pdf24_36">BName &nbsp;', 'class="pdf24_12 pdf24_08 pdf24_36">');
  }

  return html;
}

export async function callQwen(env, messages, apiKey) {
  // Detect if any message contains an image
  const hasImage = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url'));
  // Check if the latest user message has text content alongside the image
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastHasText = lastUserMsg && Array.isArray(lastUserMsg.content) && lastUserMsg.content.some(c => c.type === 'text' && c.text.trim());
  // Only use VL-only JSON extraction when image is sent WITHOUT any text
  const vlOnlyMode = hasImage && !lastHasText;
  const model = hasImage ? 'qwen-vl-plus' : 'qwen-plus';

  const systemMsg = { role: 'system', content: getSystemPrompt() };
  // VL-only: used when user sends a bare image with no text
  const vlSystemPrompt = `你是火炭會聚會助理龍蝦仔🦞。用戶發送了一張付款憑證截圖（PayMe/FPS/銀行轉帳）。

請從圖片中提取以下資訊並以JSON格式回覆（只回覆JSON，不要其他文字）：
{
  "payer_name": "付款人顯示的名稱（中英文皆可）",
  "phone": "電話號碼（如有）",
  "amount": 金額數字（只回數字，唔好有$或逗號）,
  "date": "交易日期 YYYY-MM-DD（如有）",
  "bank": "付款銀行或平台（如有）",
  "note": "備註/參考號碼（如有）"
}
如果某欄位無法辨識，填null。`;
  const allMsgs = vlOnlyMode
    ? [{ role: 'system', content: vlSystemPrompt }, ...messages]
    : [systemMsg, ...messages];

  const tools = getTools();
  const payload = {
    model,
    messages: allMsgs,
    tools: vlOnlyMode ? undefined : tools
  };

  if (!apiKey) return { reply: 'API key 未設定。' };

  // ── Image + Text receipt flow: extract from image first, then generate receipt ──
  if (hasImage && !vlOnlyMode) {
    const userText = lastUserMsg.content.find(c => c.type === 'text');
    const textContent = userText ? userText.text.trim() : '';
    const isReceiptRequest = textContent && /出收據|開收據|整收據|收據|receipt|give me.*receipt|generate.*receipt|paid|付款/i.test(textContent);

    if (isReceiptRequest) {
      // Step 1: Call qwen-vl-plus to extract info from image as JSON
      let extracted = null;
      try {
        const vlResp = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: 'qwen-vl-plus',
            messages: [{ role: 'system', content: vlSystemPrompt }, ...messages]
          })
        });
        const vlData = await vlResp.json();
        const vlReply = vlData.choices?.[0]?.message?.content || '';
        const jsonMatch = vlReply.match(/\{[\s\S]*"payer_name"[\s\S]*\}/);
        if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
        else {
          const anyJson = vlReply.match(/\{[\s\S]*\}/);
          if (anyJson) extracted = JSON.parse(anyJson[0]);
        }
      } catch (e) { /* extraction failed */ }

      if (extracted && extracted.payer_name) {
        // Step 2: Combine extracted info + user text → generate receipt
        const name = extracted.payer_name;
        const amount = extracted.amount ? parseInt(extracted.amount) : 0;
        const date = extracted.date || '';
        const phone = extracted.phone || '';

        // Extract payment method and event from user text
        let payment_method = '';
        if (textContent.match(/現金|cash/i)) payment_method = 'cash';
        else if (textContent.match(/payme/i)) payment_method = 'PayMe';
        else if (textContent.match(/fps|轉數快/i)) payment_method = 'FPS';
        else if (textContent.match(/支票|cheque|check/i)) payment_method = 'cheque';

        let event = '';
        const eventMatch = textContent.match(/(?:for|at|in|活動|聚餐)?\s*(例會|特別會議|週年聚餐|四週年聚餐)/i);
        if (eventMatch) event = eventMatch[1];

        const fnResult = await executeFunction(env, 'generate_receipt', {
          name, amount, phone, date, event,
          payment_method,
          text: textContent
        });
        const result = JSON.parse(fnResult);

        if (result.ok) {
          // Build summary with extracted info
          let summary = '📸 憑證分析結果：\n';
          summary += '🏷️ 付款人：' + name + '\n';
          if (amount) summary += '💰 金額：港幣$' + amount + '\n';
          if (date) summary += '📅 日期：' + date + '\n';
          if (payment_method) summary += '💳 付款方式：' + (payment_method === 'cash' ? '現金' : payment_method === 'FPS' ? 'FPS轉數快' : payment_method === 'PayMe' ? 'PayMe' : payment_method) + '\n';
          if (event) summary += '🎉 活動：' + event + '\n';
          summary += '\n' + result.message.replace(/📥\s*(\/api[^\s]+)/g, '📥 <a href="$1" target="_blank">撳呢度下載收據</a>');
          return { reply: summary, tools_used: ['generate_receipt'] };
        } else {
          return { reply: '📸 已從圖片提取：' + name + (amount ? ' | 港幣$' + amount : '') + '\n但收據生成失敗：' + (result.error || '不明錯誤'), tools_used: [] };
        }
      } else {
        return { reply: '📸 無法從圖片中辨識付款人資訊，請手動提供姓名同金額。', tools_used: [] };
      }
    }
  }

  let msgs = [...messages];
  let data, choice;
  let toolsCalled = [];
  const maxRounds = vlOnlyMode ? 1 : 3;

  for (let round = 0; round < maxRounds; round++) {
    // Always include tools + system prompt in every round so the model
    // can chain tool calls and properly process results
    const pl = {
      model,
      messages: [{ role: 'system', content: vlOnlyMode ? vlSystemPrompt : getSystemPrompt() }, ...msgs],
      ...(vlOnlyMode ? {} : { tools })
    };
    const resp = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(pl)
    });
    data = await resp.json();
    choice = data.choices?.[0];

    if (!choice?.message?.tool_calls) break;

    msgs.push(choice.message);
    for (const tc of choice.message.tool_calls) {
      toolsCalled.push(tc.function.name);
      let fnResult = '';
      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        fnResult = await executeFunction(env, tc.function.name, args);
      } catch (e) {
        fnResult = JSON.stringify({ error: e.message });
      }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: fnResult });
    }
  }

  let reply = data.choices?.[0]?.message?.content || '抱歉，我無法處理這個請求。';

  // For VL-only image extraction: auto-search the database
  if (vlOnlyMode && reply) {
    try {
      // Try to parse JSON from VL response
      let extracted = null;
      const jsonMatch = reply.match(/\{[\s\S]*"payer_name"[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try parsing any JSON
        const anyJson = reply.match(/\{[\s\S]*\}/);
        if (anyJson) extracted = JSON.parse(anyJson[0]);
      }

      if (extracted && (extracted.payer_name || extracted.phone)) {
        const searchResult = JSON.parse(await executeFunction(env, 'lookup_payer', {
          search_name: extracted.payer_name || '',
          search_tel: extracted.phone || '',
          amount: extracted.amount || null
        }));
        const sr = JSON.parse(searchResult);
        if (sr.ok && sr.found) {
          let summary = '📸 憑證分析結果：\n';
          if (extracted.payer_name) summary += '🏷️ 付款人: ' + extracted.payer_name + '\n';
          if (extracted.phone) summary += '📱 電話: ' + extracted.phone + '\n';
          if (extracted.amount) summary += '💰 金額: HK$' + extracted.amount + '\n';
          if (extracted.bank) summary += '🏦 平台: ' + extracted.bank + '\n';
          if (extracted.note) summary += '📝 備註: ' + extracted.note + '\n';
          summary += '\n📋 資料庫匹配結果 (' + sr.count + '人)：\n';
          sr.people.forEach((p, i) => {
            summary += (i+1) + '. ' + p.name + ' | ' + p.tel + ' | ' + p.person_type;
            if (p.professional) summary += ' | ' + p.professional;
            summary += ' | ' + (p.payment_status === 'paid' ? '✅已付' : p.payment_status === 'free' ? '🆓免費' : '❌未付');
            if (p.table_number) summary += ' | 🍽' + p.table_number;
            summary += '\n';
          });
          if (sr.people.length === 0) summary += '⚠️ 找不到匹配記錄，請手動確認\n';

          // Auto-generate receipt if we have a name and amount
          if (sr.people.length > 0 && extracted.amount) {
            try {
              const payerName = sr.people[0].name;
              const rKey = await generateReceiptDirect(env, payerName, extracted.amount, extracted.phone || '', extracted.date || '', '');
              const receiptUrl = rKey ? '/api/image?name=' + encodeURIComponent(rKey) + '&download=1' : null;
              if (receiptUrl) {
                summary += '\n🧾 收據已自動生成！\n📥 ' + receiptUrl;
              }
            } catch (e) { /* receipt generation failed, continue without it */ }
          }

          reply = summary;
        } else {
          reply = '📸 已從憑證提取：\n🏷️ ' + (extracted.payer_name || '?') + '\n💰 HK$' + (extracted.amount || '?') + '\n\n⚠️ 但在資料庫中找不到匹配的人員。請手動確認。';
        }
      }
    } catch (e) {
      // Extraction failed, return VL reply as-is
    }
  }

  return { reply, tools_used: toolsCalled };
}
