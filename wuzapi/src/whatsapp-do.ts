/**
 * WhatsApp Durable Object — runs Baileys inside Cloudflare's edge.
 * Replaces local wuzapi.exe + relay.py + cloudflared tunnel.
 *
 * One DO instance per bot (via idFromName).
 */
import { DurableObject } from "cloudflare:workers";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type AuthenticationState,
  type AuthenticationCreds,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";

// ---------------------------------------------------------------------------
// DO-based auth state (replaces useMultiFileAuthState)
// ---------------------------------------------------------------------------

interface DOAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

function makeDOAuthState(sql: SqlStorage): DOAuthState {
  let _creds: AuthenticationCreds | null = null;

  async function loadCreds(): Promise<AuthenticationCreds> {
    if (_creds) return _creds;
    const row = sql
      .exec("SELECT value FROM auth_creds WHERE key = 'main'")
      .one() as { value: string } | undefined;
    _creds = row
      ? (JSON.parse(row.value) as AuthenticationCreds)
      : ({} as AuthenticationCreds);
    return _creds;
  }

  async function saveCreds(): Promise<void> {
    if (!_creds) return;
    sql.exec(
      "INSERT OR REPLACE INTO auth_creds (key, value) VALUES ('main', ?)",
      JSON.stringify(_creds)
    );
  }

  const state: AuthenticationState = {
    get creds(): AuthenticationCreds {
      return _creds || ({} as AuthenticationCreds);
    },
    set creds(v: AuthenticationCreds) {
      _creds = v;
    },

    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: Record<string, SignalDataTypeMap[T]> = {};
        for (const id of ids) {
          const key = `${type}|${id}`;
          const row = sql
            .exec("SELECT value FROM auth_keys WHERE key = ?", key)
            .one() as { value: string } | undefined;
          if (row) {
            try {
              result[id] = JSON.parse(row.value) as SignalDataTypeMap[T];
            } catch {
              /* skip */
            }
          }
        }
        return result;
      },
      set: async (data: SignalDataSet): Promise<void> => {
        for (const [key, value] of Object.entries(data)) {
          sql.exec(
            "INSERT OR REPLACE INTO auth_keys (key, value) VALUES (?, ?)",
            key,
            JSON.stringify(value)
          );
        }
      },
    },
  };

  // Trigger initial load
  loadCreds().catch(() => {});

  return { state, saveCreds };
}

// ---------------------------------------------------------------------------
// DO Class
// ---------------------------------------------------------------------------

export class WhatsAppDO extends DurableObject {
  private sock: WASocket | null = null;
  private currentQR: string | null = null;
  private connectionState: string = "disconnected";
  private lastDisconnect: { error?: string; code?: number } = {};
  private botName: string = "";

  // @ts-ignore — Env passed by runtime
  private readonly d1: D1Database;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.d1 = env.DB;

    ctx.blockConcurrencyWhile(async () => {
      const s = this.ctx.storage.sql;
      s.exec(
        `CREATE TABLE IF NOT EXISTS auth_creds (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
      );
      s.exec(
        `CREATE TABLE IF NOT EXISTS auth_keys (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
      );
      s.exec(
        `CREATE TABLE IF NOT EXISTS do_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
      );

      const row = s
        .exec("SELECT value FROM do_state WHERE key = 'botName'")
        .one() as { value: string } | undefined;
      if (row) this.botName = row.value;

      const wasConnected = s
        .exec("SELECT value FROM do_state WHERE key = 'connectionState'")
        .one() as { value: string } | undefined;
      if (wasConnected && wasConnected.value === "open") {
        this.ctx.waitUntil?.(this.reconnect());
      }
    });
  }

  // ── RPC: Start connection & return QR ──────────────────────────────

  async generateQR(
    name: string
  ): Promise<{ qr: string; botName: string } | { error: string }> {
    this.botName = name;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO do_state (key, value) VALUES ('botName', ?)",
      name
    );

    if (this.sock) {
      if (this.currentQR)
        return { qr: this.currentQR, botName: name };
      return { error: "Already connecting — no QR available yet" };
    }

    await this.startConnection();
    if (this.currentQR)
      return { qr: this.currentQR, botName: name };
    return { error: "QR not yet generated. Poll /api/status for updates." };
  }

  // ── RPC: Send message ──────────────────────────────────────────────

  async sendMessage(
    jid: string,
    text: string
  ): Promise<{ ok: boolean; msgId?: string; error?: string }> {
    if (!this.sock) await this.startConnection();
    if (!this.sock) return { ok: false, error: "Not connected" };

    try {
      const result = await this.sock.sendMessage(jid, { text });
      return { ok: true, msgId: result?.key?.id || "" };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── RPC: Get status ────────────────────────────────────────────────

  async getStatus(): Promise<{
    state: string;
    qr: string | null;
    botName: string;
    lastDisconnect: { error?: string; code?: number };
  }> {
    return {
      state: this.connectionState,
      qr: this.currentQR,
      botName: this.botName,
      lastDisconnect: this.lastDisconnect,
    };
  }

  // ── RPC: Disconnect ────────────────────────────────────────────────

  async disconnect(): Promise<{ ok: boolean }> {
    this.sock?.end(undefined);
    this.sock = null;
    this.currentQR = null;
    this.connectionState = "disconnected";
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO do_state (key, value) VALUES ('connectionState', 'disconnected')"
    );
    await this.ctx.storage.deleteAlarm();
    return { ok: true };
  }

  // ── RPC: Force reconnect ───────────────────────────────────────────

  async reconnect(): Promise<{ ok: boolean; error?: string }> {
    try {
      this.sock?.end(undefined);
      this.sock = null;
      this.currentQR = null;
      await this.startConnection();
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Alarm: Keep-alive while connected ──────────────────────────────

  async alarm(): Promise<void> {
    if (this.connectionState === "open" && this.sock) {
      await this.ctx.storage.setAlarm(Date.now() + 25_000);
    } else if (
      this.connectionState === "disconnected" &&
      this.botName
    ) {
      await this.reconnect().catch(() => {});
    }
  }

  // ── Internal: Start Baileys connection ─────────────────────────────

  private async startConnection(): Promise<void> {
    if (this.sock) return;

    const auth = makeDOAuthState(this.ctx.storage.sql);

    const { version, isLatest } = await fetchLatestBaileysVersion().catch(
      () => ({
        version: [2, 3000, 0] as [number, number, number],
        isLatest: true,
      })
    );
    console.log(
      `[WhatsAppDO] Baileys v${version.join(".")}, latest=${isLatest}`
    );

    const noop = (..._args: unknown[]) => {};
    const childLogger = () => ({
      level: "info" as const,
      info: noop,
      error: noop,
      warn: noop,
      debug: noop,
      trace: noop,
      child: childLogger,
    });

    const sock = makeWASocket({
      version,
      auth: auth.state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      qrTimeout: 60_000,
      logger: {
        level: "info" as const,
        info: noop,
        error: noop,
        warn: noop,
        debug: noop,
        trace: noop,
        child: childLogger,
      } as unknown as Parameters<typeof makeWASocket>[0]["logger"],
    });

    this.sock = sock;

    // ── Events ──
    sock.ev.on(
      "connection.update",
      (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.currentQR = qr;
          this.connectionState = "qr";
        }

        if (connection === "open") {
          this.currentQR = null;
          this.connectionState = "open";
          this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO do_state (key, value) VALUES ('connectionState', 'open')"
          );
          this.ctx.storage.setAlarm(Date.now() + 25_000).catch(() => {});
          console.log(`[WhatsAppDO] ${this.botName}: connected`);
        }

        if (connection === "close") {
          this.currentQR = null;
          this.connectionState = "disconnected";
          this.lastDisconnect = lastDisconnect
            ? {
                error:
                  (lastDisconnect.error as Error)?.message ||
                  String(lastDisconnect.error || ""),
                code: (lastDisconnect.error as any)?.output?.statusCode as number | undefined,
              }
            : {};
          this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO do_state (key, value) VALUES ('connectionState', 'disconnected')"
          );

          const code = this.lastDisconnect.code;
          const shouldReconnect =
            code !== DisconnectReason.loggedOut;

          console.log(
            `[WhatsAppDO] ${this.botName}: disconnected (code=${code}, reconnect=${shouldReconnect})`
          );

          if (shouldReconnect) {
            this.ctx.storage
              .setAlarm(Date.now() + 5_000)
              .catch(() => {});
          }
        }
      }
    );

    sock.ev.on("creds.update", () => {
      auth.saveCreds().catch((err: Error) =>
        console.error("[WhatsAppDO] saveCreds error:", err.message)
      );
    });

    sock.ev.on("messages.upsert", async (m) => {
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";
        if (!text) continue;

        try {
          await this.d1
            .prepare(
              `INSERT OR IGNORE INTO messages (userbot_name, phone, text, direction, status, created_at)
               VALUES (?1, ?2, ?3, 'in', 'delivered', ?4)`
            )
            .bind(
              this.botName,
              msg.key.remoteJid || "",
              text,
              msg.messageTimestamp
                ? new Date(
                    (msg.messageTimestamp as number) * 1000
                  ).toISOString()
                : new Date().toISOString()
            )
            .run();
        } catch {
          /* skip */
        }
      }
    });

    sock.ev.on("messaging-history.set", async (history) => {
      const conversations = (
        history as Record<string, unknown>
      ).conversations as
        | Array<{
            id?: string;
            messages?: Array<Record<string, unknown>>;
          }>
        | undefined;
      if (!conversations) return;

      for (const conv of conversations) {
        for (const msg of conv.messages || []) {
          const key = msg.key as
            | { fromMe?: boolean; remoteJid?: string }
            | undefined;
          if (key?.fromMe) continue;
          const message = msg.message as
            | {
                conversation?: string;
                extendedTextMessage?: { text?: string };
              }
            | undefined;
          const text =
            message?.conversation ||
            message?.extendedTextMessage?.text ||
            "";
          if (!text) continue;

          try {
            await this.d1
              .prepare(
                `INSERT OR IGNORE INTO messages (userbot_name, phone, text, direction, status, created_at)
                 VALUES (?1, ?2, ?3, 'in', 'delivered', ?4)`
              )
              .bind(
                this.botName,
                key?.remoteJid || conv.id || "",
                text,
                new Date(
                  ((msg.messageTimestamp as number) || 0) * 1000
                ).toISOString()
              )
              .run();
          } catch {
            /* skip */
          }
        }
      }
    });
  }
}
