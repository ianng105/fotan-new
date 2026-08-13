/**
 * WhatsApp Cloudflare Worker — wuzapi proxy mode.
 * When WUZAPI_URL is set: proxies API calls to local wuzapi through cloudflared tunnel.
 * When WUZAPI_URL is not set: falls back to Durable Object (Baileys) mode.
 */
import registerHtml from "../register.html";
import sendMessageHtml from "../send-message.html";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return corsResponse();

    try {
      // ── Static Pages ──
      if ((pathname === "/" || pathname === "/site/register-whatsapp") && method === "GET") {
        return htmlResponse(registerHtml);
      }
      if (pathname.startsWith("/site/send-message") && method === "GET") {
        return htmlResponse(sendMessageHtml);
      }

      // ── Health ──
      if (pathname === "/api/health" && method === "GET") {
        return corsResponse(Response.json({
          status: "ok",
          mode: env.WUZAPI_URL ? "wuzapi-proxy" : "baileys-do",
        }));
      }

      // ── Register ──
      if (pathname === "/api/register-whatsapp" && method === "POST") {
        return await handleRegister(request, env);
      }

      // ── Send Message ──
      if (pathname === "/api/send-message" && method === "POST") {
        return await handleSendMessage(request, env);
      }

      // ── Status ──
      const statusMatch = pathname.match(/^\/api\/status\/([a-zA-Z0-9_-]+)$/);
      if (statusMatch && method === "GET") {
        return await handleStatus(env, statusMatch[1]);
      }

      // ── Messages (poll) ──
      const msgMatch = pathname.match(/^\/api\/messages\/([a-zA-Z0-9_-]+)$/);
      if (msgMatch && method === "GET") {
        return await handlePollMessages(env, msgMatch[1]);
      }

      // ── List UserBots ──
      if (pathname === "/api/userbots" && method === "GET") {
        return await handleListUserBots(env);
      }

      // ── Message History ──
      if (pathname === "/api/message-history" && method === "GET") {
        return await handleMessageHistory(request, env);
      }

      // ── Delete UserBot ──
      const delMatch = pathname.match(/^\/api\/userbots\/([a-zA-Z0-9_-]+)$/);
      if (delMatch && method === "DELETE") {
        return await handleDeleteUserBot(request, env, delMatch[1]);
      }

      // ── Sync bots (update connection status from wuzapi) ──
      if (pathname === "/api/sync-bots" && method === "POST") {
        return await handleSyncBots(env);
      }

      // ── Incoming message webhook (from wuzapi → relay) ──
      if (pathname === "/api/incoming-message" && method === "POST") {
        return await handleIncomingMessage(request, env, _ctx);
      }

      // ── Key Management ──
      if (pathname === "/api/keys" && method === "GET") {
        return await handleListKeys(request, env);
      }
      if (pathname === "/api/keys" && method === "POST") {
        return await handleCreateKey(request, env);
      }
      const delKeyMatch = pathname.match(/^\/api\/keys\/(.+)$/);
      if (delKeyMatch && method === "DELETE") {
        return await handleDeleteKey(request, env, delKeyMatch[1]);
      }

      return corsResponse(Response.json({ error: "NOT_FOUND" }, { status: 404 }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker]", msg);
      return corsResponse(Response.json({ error: "INTERNAL_ERROR", message: msg }, { status: 500 }));
    }
  },
};

// ── Wuzapi proxy helper ──────────────────────────────────────────────────

interface WuzapiResponse {
  code: number;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  details?: string;
}

async function wuzapiCall(
  env: Env,
  path: string,
  method: string,
  token: string,
  body?: Record<string, unknown>
): Promise<WuzapiResponse> {
  const baseUrl = env.WUZAPI_URL;
  if (!baseUrl) throw new Error("WUZAPI_URL not configured");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "token": token,
  };

  const init: RequestInit = { method, headers };
  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, init);
  return (await res.json()) as WuzapiResponse;
}

async function wuzapiAdminCall(
  env: Env,
  path: string,
  method: string,
  body?: Record<string, unknown>
): Promise<WuzapiResponse> {
  const baseUrl = env.WUZAPI_URL;
  if (!baseUrl) throw new Error("WUZAPI_URL not configured");

  const adminToken = env.WUZAPI_ADMIN_TOKEN || "my-admin-secret-token";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": adminToken,
  };

  const init: RequestInit = { method, headers };
  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, init);
  return (await res.json()) as WuzapiResponse;
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function validateApiKey(db: D1Database, key: string): Promise<boolean> {
  if (!db || !key) return false;
  try {
    const result = await db
      .prepare("SELECT key FROM api_keys WHERE key = ?1 AND active = 1")
      .bind(key)
      .first();
    if (result) {
      await db
        .prepare("UPDATE api_keys SET last_used = datetime('now') WHERE key = ?1")
        .bind(key)
        .run()
        .catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function makeWuzapiWebhookUrl(_env: Env): string {
  // wuzapi sends webhooks to relay.py on the same machine
  // relay.py then forwards to this Worker's /api/incoming-message
  return "http://localhost:3100/webhook";
}

// ── API Handlers ─────────────────────────────────────────────────────────

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userBot = String(body.userBot || "").trim();
  const apiKey = request.headers.get("X-Admin-Password") || "";

  if (!userBot || !apiKey) {
    return corsResponse(Response.json(
      { error: "BAD_REQUEST", message: "Missing userBot or admin password" },
      { status: 400 }
    ));
  }

  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(Response.json(
      { error: "UNAUTHORIZED", message: "Invalid API key" },
      { status: 401 }
    ));
  }

  // Reuse existing bot record if re-registering the same name
  const existing = await env.DB.prepare("SELECT id, token FROM userbots WHERE name = ?1")
    .bind(userBot)
    .first<{ id: string; token: string }>();

  const botId = existing?.id || crypto.randomUUID();
  const botToken = existing?.token || userBot + "-" + crypto.randomUUID().slice(0, 8);

  // Upsert in D1 (unique on name)
  await env.DB.prepare(
    `INSERT INTO userbots (id, name, token, phone, connected, logged_in, created_at, updated_at)
     VALUES (?1, ?2, ?3, '', 0, 0, datetime('now'), datetime('now'))
     ON CONFLICT(name) DO UPDATE SET token = ?3, updated_at = datetime('now')`
  )
    .bind(botId, userBot, botToken)
    .run();

  if (env.WUZAPI_URL) {
    // ── Wuzapi proxy mode ──
    try {
      // 1. Create user in wuzapi (with message events for incoming webhooks)
      const webhookUrl = makeWuzapiWebhookUrl(env);
      const create = await wuzapiAdminCall(env, "/admin/users", "POST", {
        name: userBot,
        token: botToken,
        webhook: webhookUrl,
        events: "Message",  // wuzapi expects space-separated string: "Message Presence"
      });
      // User may already exist from a previous registration — that's fine,
      // we can still connect with the same token
      if (!create.success && create.code !== 409 && create.error !== "already exists") {
        return corsResponse(Response.json(
          { error: "WUZAPI_ERROR", message: create.error || create.details || "Failed to create user" },
          { status: 500 }
        ));
      }

      // 2. Connect session
      const connect = await wuzapiCall(env, "/session/connect", "POST", botToken, {});
      if (!connect.success && connect.code !== 409) { // 409 = already connected
        return corsResponse(Response.json(
          { error: "WUZAPI_ERROR", message: connect.error || "Failed to connect session" },
          { status: 500 }
        ));
      }

      // 3. Get QR code (wuzapi returns base64 PNG directly)
      const qrResp = await wuzapiCall(env, "/session/qr", "GET", botToken);
      if (qrResp.success && qrResp.data?.QRCode) {
        const qrData = String(qrResp.data.QRCode);
        await env.DB.prepare(
          "UPDATE userbots SET connected = 1, updated_at = datetime('now') WHERE name = ?1"
        ).bind(userBot).run();

        // wuzapi returns base64 PNG (data:image/png;base64,...) — use as img src directly
        // DO mode returns text string — convert to QR image via qrserver
        const isBase64Png = qrData.startsWith("data:image");
        return corsResponse(Response.json({
          id: botId,
          qr: qrData,
          qrLink: isBase64Png
            ? qrData  // use directly as img src
            : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`,
          userBot,
          botToken,
        }));
      }

      return corsResponse(Response.json({
        id: botId,
        qr: null,
        message: "QR pending — poll /api/status",
        userBot,
        botToken,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return corsResponse(Response.json(
        { error: "WUZAPI_CONNECTION", message: `Cannot reach wuzapi: ${msg}` },
        { status: 502 }
      ));
    }
  }

  // ── Fallback: DO mode ──
  const stub = getDO(env, userBot);
  try {
    const result = await stub.generateQR(userBot);
    if ("qr" in result) {
      await env.DB.prepare(
        "UPDATE userbots SET connected = 1, updated_at = datetime('now') WHERE name = ?1"
      ).bind(userBot).run();
      return corsResponse(Response.json({
        id: botId,
        qr: result.qr,
        qrLink: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.qr)}`,
        userBot,
        botToken,
      }));
    }
    return corsResponse(Response.json({
      id: botId,
      qr: null,
      message: result.error || "QR pending",
      userBot,
      botToken,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return corsResponse(Response.json(
      { error: "REGISTER_ERROR", message: msg },
      { status: 500 }
    ));
  }
}

async function handleSendMessage(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const userBot = String(body.userBot || "");
  const to = String(body.to || body.phone || "");  // frontend sends "phone", API sends "to"
  const message = String(body.message || "");
  const apiKey = request.headers.get("X-API-Key") || request.headers.get("X-Admin-Password") || "";

  if (!userBot || !to || !message) {
    return corsResponse(Response.json(
      { error: "BAD_REQUEST", message: "Missing userBot, to, or message" },
      { status: 400 }
    ));
  }

  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(Response.json(
      { error: "UNAUTHORIZED", message: "Invalid API key" },
      { status: 401 }
    ));
  }

  // Look up bot's wuzapi token
  const bot = await env.DB.prepare("SELECT token FROM userbots WHERE name = ?1")
    .bind(userBot)
    .first<{ token: string }>();
  const botToken = bot?.token || userBot;

  let jid = to;
  if (!jid.includes("@")) {
    jid = jid.replace(/\D/g, "") + "@s.whatsapp.net";
  }

  if (env.WUZAPI_URL) {
    // ── Wuzapi proxy mode ──
    try {
      const result = await wuzapiCall(env, "/chat/send/text", "POST", botToken, {
        phone: jid,
        body: message,
      });
      if (result.success) {
        await env.DB.prepare(
          `INSERT INTO messages (userbot_name, phone, text, direction, status, created_at)
           VALUES (?1, ?2, ?3, 'out', 'sent', datetime('now'))`
        ).bind(userBot, jid, message).run();
        return corsResponse(Response.json({ ok: true, userBot, to: jid }));
      }
      return corsResponse(Response.json(
        { error: "SEND_FAILED", message: result.error || result.details || "Unknown error" },
        { status: 500 }
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return corsResponse(Response.json(
        { error: "WUZAPI_CONNECTION", message: `Cannot reach wuzapi: ${msg}` },
        { status: 502 }
      ));
    }
  }

  // ── Fallback: DO mode ──
  const stub = getDO(env, userBot);
  try {
    const result = await stub.sendMessage(jid, message);
    if (result.ok) {
      await env.DB.prepare(
        `INSERT INTO messages (userbot_name, phone, text, direction, status, created_at)
         VALUES (?1, ?2, ?3, 'out', 'sent', datetime('now'))`
      ).bind(userBot, jid, message).run();
      return corsResponse(Response.json({ ok: true, msgId: result.msgId, userBot, to: jid }));
    }
    return corsResponse(Response.json(
      { error: "SEND_FAILED", message: result.error },
      { status: 500 }
    ));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return corsResponse(Response.json(
      { error: "SEND_ERROR", message: msg },
      { status: 500 }
    ));
  }
}

async function handleStatus(env: Env, botName: string): Promise<Response> {
  if (env.WUZAPI_URL) {
    try {
      const bot = await env.DB.prepare("SELECT token FROM userbots WHERE name = ?1")
        .bind(botName)
        .first<{ token: string }>();
      const botToken = bot?.token || botName;

      const result = await wuzapiCall(env, "/session/status", "GET", botToken);
      if (result.success && result.data) {
        return corsResponse(Response.json({
          state: result.data.loggedIn ? "open" : (result.data.connected ? "connecting" : "disconnected"),
          qr: result.data.qrcode || null,
          botName,
          lastDisconnect: {},
          phone: result.data.jid || "",
        }));
      }
      return corsResponse(Response.json({
        state: "error", qr: null, botName, lastDisconnect: {},
        error: result.error,
      }));
    } catch {
      return corsResponse(Response.json({
        state: "error", qr: null, botName, lastDisconnect: {},
        error: "Cannot reach wuzapi",
      }));
    }
  }

  // Fallback: DO mode
  const stub = getDO(env, botName);
  const status = await stub.getStatus();
  return corsResponse(Response.json(status));
}

async function handlePollMessages(env: Env, botName: string): Promise<Response> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `SELECT * FROM messages WHERE userbot_name = ?1 AND direction = 'in' AND created_at > ?2 ORDER BY created_at DESC LIMIT 100`
  ).bind(botName, cutoff).all();
  return corsResponse(Response.json(result.results || []));
}

async function handleListUserBots(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM userbots ORDER BY created_at DESC"
  ).all();
  return corsResponse(Response.json({ userBots: result.results || [] }));
}

async function handleMessageHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userbot = url.searchParams.get("userbot") || "";
  const phone = url.searchParams.get("phone") || "";
  const limit = parseInt(url.searchParams.get("limit") || "50");

  let query = "SELECT * FROM messages WHERE 1=1";
  const params: (string | number)[] = [];
  let idx = 1;

  if (userbot) { query += ` AND userbot_name = ?${idx++}`; params.push(userbot); }
  if (phone) { query += ` AND phone = ?${idx++}`; params.push(phone); }
  query += ` ORDER BY created_at DESC LIMIT ?${idx++}`;
  params.push(limit);

  let stmt = env.DB.prepare(query);
  for (let i = 0; i < params.length; i++) { stmt = stmt.bind(i + 1, params[i]); }
  const result = await stmt.all();
  return corsResponse(Response.json(result.results || []));
}

async function handleDeleteUserBot(request: Request, env: Env, botId: string): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const bot = await env.DB.prepare("SELECT name, token FROM userbots WHERE id = ?1")
    .bind(botId)
    .first<{ name: string; token: string }>();

  if (bot && env.WUZAPI_URL) {
    try {
      await wuzapiCall(env, "/session/logout", "POST", bot.token, {});
    } catch { /* ignore */ }
  } else if (bot) {
    try { const stub = getDO(env, bot.name); await stub.disconnect(); } catch { /* ignore */ }
  }

  await env.DB.prepare("DELETE FROM userbots WHERE id = ?1").bind(botId).run();
  await env.DB.prepare("DELETE FROM messages WHERE userbot_name = ?1")
    .bind(bot?.name || "").run();

  return corsResponse(Response.json({ ok: true }));
}

async function handleSyncBots(env: Env): Promise<Response> {
  const bots = await env.DB.prepare("SELECT * FROM userbots").all<{
    id: string; name: string; token: string; connected: number; phone: string;
  }>();

  if (env.WUZAPI_URL) {
    for (const bot of bots.results || []) {
      try {
        const status = await wuzapiCall(env, "/session/status", "GET", bot.token);
        const isLoggedIn = status.success && status.data?.loggedIn ? 1 : 0;
        const jid = String(status.data?.jid || "");
        // Always update — phone may have changed even if connected status didn't
        if (isLoggedIn !== bot.connected || jid !== bot.phone) {
          await env.DB.prepare(
            "UPDATE userbots SET connected = ?1, phone = ?2, logged_in = ?3, updated_at = datetime('now') WHERE id = ?4"
          ).bind(isLoggedIn, jid, isLoggedIn, bot.id).run();
        }
      } catch {
        // Only mark disconnected if we can't reach wuzapi at all
      }
    }
    return corsResponse(Response.json({ ok: true }));
  }

  // Fallback: DO mode
  for (const bot of bots.results || []) {
    try {
      const stub = getDO(env, bot.name);
      const status = await stub.getStatus();
      const isConnected = status.state === "open" ? 1 : 0;
      if (isConnected !== bot.connected) {
        await env.DB.prepare(
          "UPDATE userbots SET connected = ?1, updated_at = datetime('now') WHERE id = ?2"
        ).bind(isConnected, bot.id).run();
      }
    } catch {
      await env.DB.prepare(
        "UPDATE userbots SET connected = 0, updated_at = datetime('now') WHERE id = ?1"
      ).bind(bot.id).run();
    }
  }
  return corsResponse(Response.json({ ok: true }));
}

// ── Incoming Message Webhook ─────────────────────────────────────────────

async function handleIncomingMessage(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // wuzapi webhook format: { event: "Message", user: "botname", data: { ... } }
  // Fields can vary — handle several shapes robustly
  const userBot = String(body.user || body.name || body.username || "");
  const data = (body.data || body) as Record<string, unknown>;
  const chat = (data.chat || {}) as Record<string, unknown>;
  const phone =
    String(chat.JID || data.jid || data.remoteJid || data.from || chat.remoteJid || "");
  const text =
    String(data.text || data.body || data.message || data.content || "");

  if (!userBot || !phone || !text) {
    return corsResponse(Response.json({ ok: true, skipped: "no content" }));
  }

  // 1. Store incoming message in D1
  await env.DB.prepare(
    `INSERT INTO messages (userbot_name, phone, text, direction, status, created_at)
     VALUES (?1, ?2, ?3, 'in', 'delivered', datetime('now'))`
  ).bind(userBot, phone, text).run().catch(() => {});

  // 2. Route to fotan chatbot and reply in background (don't block webhook ack)
  ctx.waitUntil(chatbotReply(env, userBot, phone, text));

  return corsResponse(Response.json({ ok: true }));
}

async function chatbotReply(env: Env, userBot: string, phone: string, text: string): Promise<void> {
  try {
    const FOTAN_API_URL = "https://fotan.techforliving.net";

    // Load recent conversation history for this phone (last 10 messages)
    const history = await env.DB.prepare(
      `SELECT text, direction FROM messages
       WHERE userbot_name = ?1 AND phone = ?2
       ORDER BY created_at DESC LIMIT 10`
    ).bind(userBot, phone).all<{ text: string; direction: string }>();

    const messages: { role: string; content: string }[] = [];
    const rows = (history.results || []).reverse();
    for (const row of rows) {
      const role = row.direction === "out" ? "assistant" : "user";
      // Merge consecutive same-role messages
      if (messages.length && messages[messages.length - 1].role === role && role === "user") {
        messages[messages.length - 1] = { role, content: row.text };
      } else {
        messages.push({ role, content: row.text });
      }
    }
    // Ensure the last user message is the current one
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: text });
    }

    // Call fotan chatbot
    const chatRes = await fetch(`${FOTAN_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!chatRes.ok) {
      console.error(`[chatbot] fotan API returned ${chatRes.status}`);
      return;
    }
    const chatData = (await chatRes.json()) as { reply?: string; error?: string };
    const reply = chatData.reply || "";
    if (!reply) return;

    // Store reply in D1
    await env.DB.prepare(
      `INSERT INTO messages (userbot_name, phone, text, direction, status, created_at)
       VALUES (?1, ?2, ?3, 'out', 'sent', datetime('now'))`
    ).bind(userBot, phone, reply).run().catch(() => {});

    // Send reply via wuzapi
    if (!env.WUZAPI_URL) return;
    const bot = await env.DB.prepare("SELECT token FROM userbots WHERE name = ?1")
      .bind(userBot)
      .first<{ token: string }>();
    const botToken = bot?.token || userBot;

    await wuzapiCall(env, "/chat/send/text", "POST", botToken, {
      phone,
      body: reply,
    });
  } catch (err: unknown) {
    console.error("[chatbot] reply error:", err instanceof Error ? err.message : String(err));
  }
}

// ── Key Management ───────────────────────────────────────────────────────

async function handleListKeys(request: Request, env: Env): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  if (!(await validateApiKey(env.DB, apiKey))) {
    return corsResponse(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }
  const result = await env.DB.prepare(
    "SELECT id, key, name, active, created_at, last_used FROM api_keys ORDER BY created_at DESC"
  ).all();
  const keys = ((result.results || []) as Array<Record<string, unknown>>).map((k) => ({
    ...k,
    key: String(k.key || "") ? String(k.key).slice(0, 8) + "..." + String(k.key).slice(-4) : "",
  }));
  return corsResponse(Response.json(keys));
}

async function handleCreateKey(request: Request, env: Env): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  if (!(await validateApiKey(env.DB, apiKey))) {
    return corsResponse(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name || "").trim() || "API Key " + Date.now();
  const newKey = "wk_" + crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO api_keys (key, name, active) VALUES (?1, ?2, 1)")
    .bind(newKey, name).run();
  return corsResponse(Response.json({ id: newKey.slice(0, 8), key: newKey, name }));
}

async function handleDeleteKey(request: Request, env: Env, keyId: string): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  if (!(await validateApiKey(env.DB, apiKey))) {
    return corsResponse(Response.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }
  const count = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM api_keys WHERE active = 1"
  ).first<{ cnt: number }>();
  if (count && count.cnt <= 1) {
    return corsResponse(Response.json(
      { error: "CANNOT_DELETE_LAST_KEY", message: "Cannot delete the last active API key" },
      { status: 400 }
    ));
  }
  await env.DB.prepare("UPDATE api_keys SET active = 0 WHERE id = ?1 OR key = ?1")
    .bind(keyId).run();
  return corsResponse(Response.json({ ok: true }));
}

// ── DO stub (fallback) ───────────────────────────────────────────────────

interface WhatsAppDOStub {
  generateQR(name: string): Promise<{ qr: string; botName: string } | { error: string }>;
  sendMessage(jid: string, text: string): Promise<{ ok: boolean; msgId?: string; error?: string }>;
  getStatus(): Promise<{ state: string; qr: string | null; botName: string; lastDisconnect: { error?: string; code?: number } }>;
  disconnect(): Promise<{ ok: boolean }>;
}

function getDO(env: Env, botName: string): WhatsAppDOStub {
  const id = env.WHATSAPP_DO.idFromName(botName);
  return env.WHATSAPP_DO.get(id) as unknown as WhatsAppDOStub;
}

// ── Response helpers ─────────────────────────────────────────────────────

function htmlResponse(html: string): Response {
  return corsResponse(new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  }));
}

function corsResponse(response?: Response): Response {
  const res = response || new Response(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password, X-API-Key");
  return res;
}

export { WhatsAppDO } from "./whatsapp-do";
