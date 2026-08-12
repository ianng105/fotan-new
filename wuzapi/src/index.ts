/**
 * WhatsApp Cloudflare Worker — 100% Cloudflare.
 * Serves HTML pages, handles API calls via Durable Object RPC, queries D1.
 */

// @ts-ignore — HTML imports handled by wrangler bundler
import registerHtml from "../register.html";
// @ts-ignore
import sendMessageHtml from "../send-message.html";

// Type helper: get a typed stub from the untyped DO namespace
interface WhatsAppDOStub {
  generateQR(name: string): Promise<{ qr: string; botName: string } | { error: string }>;
  sendMessage(jid: string, text: string): Promise<{ ok: boolean; msgId?: string; error?: string }>;
  getStatus(): Promise<{ state: string; qr: string | null; botName: string; lastDisconnect: { error?: string; code?: number } }>;
  disconnect(): Promise<{ ok: boolean }>;
  reconnect(): Promise<{ ok: boolean; error?: string }>;
}

function getDO(env: Env, botName: string): WhatsAppDOStub {
  const id = env.WHATSAPP_DO.idFromName(botName);
  return env.WHATSAPP_DO.get(id) as unknown as WhatsAppDOStub;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return corsResponse();

    try {
      // ── Static Pages ──
      if (
        (pathname === "/" || pathname === "/site/register-whatsapp") &&
        method === "GET"
      ) {
        return htmlResponse(registerHtml);
      }
      if (pathname.startsWith("/site/send-message") && method === "GET") {
        return htmlResponse(sendMessageHtml);
      }

      // ── Health ──
      if (pathname === "/api/health" && method === "GET") {
        return corsResponse(
          Response.json({ status: "ok", arch: "baileys-do-d1" })
        );
      }

      // ── API: Register ──
      if (pathname === "/api/register-whatsapp" && method === "POST") {
        return await handleRegister(request, env);
      }

      // ── API: Send Message ──
      if (pathname === "/api/send-message" && method === "POST") {
        return await handleSendMessage(request, env);
      }

      // ── API: Status ──
      const statusMatch = pathname.match(
        /^\/api\/status\/([a-zA-Z0-9_-]+)$/
      );
      if (statusMatch && method === "GET") {
        return await handleStatus(env, statusMatch[1]);
      }

      // ── API: Messages (poll) ──
      const msgMatch = pathname.match(
        /^\/api\/messages\/([a-zA-Z0-9_-]+)$/
      );
      if (msgMatch && method === "GET") {
        return await handlePollMessages(env, msgMatch[1]);
      }

      // ── API: List UserBots ──
      if (pathname === "/api/userbots" && method === "GET") {
        return await handleListUserBots(env);
      }

      // ── API: Message History (D1) ──
      if (pathname === "/api/message-history" && method === "GET") {
        return await handleMessageHistory(request, env);
      }

      // ── API: Delete UserBot ──
      const delMatch = pathname.match(
        /^\/api\/userbots\/([a-zA-Z0-9_-]+)$/
      );
      if (delMatch && method === "DELETE") {
        return await handleDeleteUserBot(request, env, delMatch[1]);
      }

      // ── API: Sync bots from DO state to D1 ──
      if (pathname === "/api/sync-bots" && method === "POST") {
        return await handleSyncBots(env);
      }

      // ── API: Key Management ──
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

      // ── 404 ──
      return corsResponse(
        Response.json({ error: "NOT_FOUND" }, { status: 404 })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker]", msg);
      return corsResponse(
        Response.json(
          { error: "INTERNAL_ERROR", message: msg },
          { status: 500 }
        )
      );
    }
  },
};

// ── Helpers ──

async function validateApiKey(
  db: D1Database,
  key: string
): Promise<boolean> {
  if (!db || !key) return false;
  try {
    const result = await db
      .prepare("SELECT key FROM api_keys WHERE key = ?1 AND active = 1")
      .bind(key)
      .first();
    if (result) {
      await db
        .prepare(
          "UPDATE api_keys SET last_used = datetime('now') WHERE key = ?1"
        )
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

// ── API Handlers ──

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const userBot = String(body.userBot || "").trim();
  const apiKey = request.headers.get("X-Admin-Password") || "";

  if (!userBot || !apiKey) {
    return corsResponse(
      Response.json(
        { error: "BAD_REQUEST", message: "Missing userBot or admin password" },
        { status: 400 }
      )
    );
  }

  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json(
        { error: "UNAUTHORIZED", message: "Invalid API key" },
        { status: 401 }
      )
    );
  }

  const botId = crypto.randomUUID();
  const botToken = userBot + "-" + crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO userbots (id, name, token, phone, connected, logged_in, created_at, updated_at)
     VALUES (?1, ?2, ?3, '', 0, 0, datetime('now'), datetime('now'))`
  )
    .bind(botId, userBot, botToken)
    .run();

  const stub = getDO(env, userBot);

  try {
    const result = await stub.generateQR(userBot);
    if ("qr" in result) {
      await env.DB.prepare(
        "UPDATE userbots SET connected = 1, updated_at = datetime('now') WHERE name = ?1"
      )
        .bind(userBot)
        .run();

      return corsResponse(
        Response.json({
          id: botId,
          qr: result.qr,
          qrLink: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.qr)}`,
          userBot,
          botToken,
        })
      );
    }
    return corsResponse(
      Response.json({
        id: botId,
        qr: null,
        message: result.error || "QR pending — poll /api/status",
        userBot,
        botToken,
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return corsResponse(
      Response.json({ error: "REGISTER_ERROR", message: msg }, { status: 500 })
    );
  }
}

async function handleSendMessage(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const userBot = String(body.userBot || "");
  const to = String(body.to || "");
  const message = String(body.message || "");
  const apiKey =
    request.headers.get("X-API-Key") ||
    request.headers.get("X-Admin-Password") ||
    "";

  if (!userBot || !to || !message) {
    return corsResponse(
      Response.json(
        { error: "BAD_REQUEST", message: "Missing userBot, to, or message" },
        { status: 400 }
      )
    );
  }

  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json(
        { error: "UNAUTHORIZED", message: "Invalid API key" },
        { status: 401 }
      )
    );
  }

  let jid = to;
  if (!jid.includes("@")) {
    jid = jid.replace(/\D/g, "") + "@s.whatsapp.net";
  }
  if (
    (jid.includes("-") || (jid.startsWith("120363") && jid.length > 15)) &&
    !jid.includes("@")
  ) {
    jid = jid + "@g.us";
  }

  const stub = getDO(env, userBot);
  try {
    const result = await stub.sendMessage(jid, message);
    if (result.ok) {
      await env.DB.prepare(
        `INSERT INTO messages (userbot_name, phone, text, direction, status, created_at)
         VALUES (?1, ?2, ?3, 'out', 'sent', datetime('now'))`
      )
        .bind(userBot, jid, message)
        .run();

      return corsResponse(
        Response.json({ ok: true, msgId: result.msgId, userBot, to: jid })
      );
    }
    return corsResponse(
      Response.json(
        { error: "SEND_FAILED", message: result.error },
        { status: 500 }
      )
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return corsResponse(
      Response.json({ error: "SEND_ERROR", message: msg }, { status: 500 })
    );
  }
}

async function handleStatus(env: Env, botName: string): Promise<Response> {
  const stub = getDO(env, botName);
  const status = await stub.getStatus();
  return corsResponse(Response.json(status));
}

async function handlePollMessages(
  env: Env,
  botName: string
): Promise<Response> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `SELECT * FROM messages WHERE userbot_name = ?1 AND direction = 'in' AND created_at > ?2 ORDER BY created_at DESC LIMIT 100`
  )
    .bind(botName, cutoff)
    .all();
  return corsResponse(Response.json(result.results || []));
}

async function handleListUserBots(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM userbots ORDER BY created_at DESC"
  ).all();
  return corsResponse(Response.json(result.results || []));
}

async function handleMessageHistory(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const userbot = url.searchParams.get("userbot") || "";
  const phone = url.searchParams.get("phone") || "";
  const limit = parseInt(url.searchParams.get("limit") || "50");

  let query = "SELECT * FROM messages WHERE 1=1";
  const params: (string | number)[] = [];
  let idx = 1;

  if (userbot) {
    query += ` AND userbot_name = ?${idx++}`;
    params.push(userbot);
  }
  if (phone) {
    query += ` AND phone = ?${idx++}`;
    params.push(phone);
  }

  query += ` ORDER BY created_at DESC LIMIT ?${idx++}`;
  params.push(limit);

  let stmt = env.DB.prepare(query);
  for (let i = 0; i < params.length; i++) {
    stmt = stmt.bind(i + 1, params[i]);
  }
  const result = await stmt.all();
  return corsResponse(Response.json(result.results || []));
}

async function handleDeleteUserBot(
  request: Request,
  env: Env,
  botId: string
): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const bot = await env.DB.prepare("SELECT name FROM userbots WHERE id = ?1")
    .bind(botId)
    .first<{ name: string }>();

  if (bot) {
    try {
      const stub = getDO(env, bot.name);
      await stub.disconnect();
    } catch {
      // ignore
    }
  }

  await env.DB.prepare("DELETE FROM userbots WHERE id = ?1")
    .bind(botId)
    .run();
  await env.DB.prepare("DELETE FROM messages WHERE userbot_name = ?1")
    .bind(bot?.name || "")
    .run();

  return corsResponse(Response.json({ ok: true }));
}

async function handleSyncBots(env: Env): Promise<Response> {
  const bots = await env.DB.prepare("SELECT * FROM userbots").all<{
    id: string;
    name: string;
    connected: number;
  }>();

  for (const bot of bots.results || []) {
    try {
      const stub = getDO(env, bot.name);
      const status = await stub.getStatus();
      const isConnected = status.state === "open" ? 1 : 0;
      if (isConnected !== bot.connected) {
        await env.DB.prepare(
          "UPDATE userbots SET connected = ?1, updated_at = datetime('now') WHERE id = ?2"
        )
          .bind(isConnected, bot.id)
          .run();
      }
    } catch {
      await env.DB.prepare(
        "UPDATE userbots SET connected = 0, updated_at = datetime('now') WHERE id = ?1"
      )
        .bind(bot.id)
        .run();
    }
  }

  return corsResponse(Response.json({ ok: true }));
}

// ── Key Management ──

async function handleListKeys(request: Request, env: Env): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const result = await env.DB.prepare(
    "SELECT id, key, name, active, created_at, last_used FROM api_keys ORDER BY created_at DESC"
  ).all();

  const keys = ((result.results || []) as Array<Record<string, unknown>>).map(
    (k) => ({
      ...k,
      key: String(k.key || "")
        ? String(k.key).slice(0, 8) + "..." + String(k.key).slice(-4)
        : "",
    })
  );

  return corsResponse(Response.json(keys));
}

async function handleCreateKey(
  request: Request,
  env: Env
): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = String(body.name || "").trim() || "API Key " + Date.now();
  const newKey = "wk_" + crypto.randomUUID().replace(/-/g, "");

  await env.DB.prepare(
    "INSERT INTO api_keys (key, name, active) VALUES (?1, ?2, 1)"
  )
    .bind(newKey, name)
    .run();

  return corsResponse(
    Response.json({ id: newKey.slice(0, 8), key: newKey, name })
  );
}

async function handleDeleteKey(
  request: Request,
  env: Env,
  keyId: string
): Promise<Response> {
  const apiKey = request.headers.get("X-Admin-Password") || "";
  const keyValid = await validateApiKey(env.DB, apiKey);
  if (!keyValid) {
    return corsResponse(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM api_keys WHERE active = 1"
  ).first<{ cnt: number }>();
  if (count && count.cnt <= 1) {
    return corsResponse(
      Response.json(
        {
          error: "CANNOT_DELETE_LAST_KEY",
          message: "Cannot delete the last active API key",
        },
        { status: 400 }
      )
    );
  }

  await env.DB.prepare(
    "UPDATE api_keys SET active = 0 WHERE id = ?1 OR key = ?1"
  )
    .bind(keyId)
    .run();

  return corsResponse(Response.json({ ok: true }));
}

// ── Response helpers ──

function htmlResponse(html: string): Response {
  return corsResponse(
    new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  );
}

function corsResponse(response?: Response): Response {
  const res = response || new Response(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Admin-Password, X-API-Key"
  );
  return res;
}


// ── Durable Object export (required by wrangler) ──
export { WhatsAppDO } from "./whatsapp-do";
