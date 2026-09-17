const MAX_SYMBOLS = 50;
const validSymbol = (value) => typeof value === "string" && /^[A-Z0-9.^=-]{1,15}$/.test(value);

function parseSymbols(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item).trim().toUpperCase()).filter(validSymbol))].slice(0, MAX_SYMBOLS);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export class LiveQuotes {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async latestQuotes(symbols) {
    if (!this.env.DB || !symbols.length) return [];
    try {
      const placeholders = symbols.map(() => "?").join(",");
      const result = await this.env.DB.prepare(
        `SELECT symbol,payload,received_at FROM broker_quotes WHERE symbol IN (${placeholders})`
      ).bind(...symbols).all();
      return (result.results || []).map((row) => {
        try {
          return { ...JSON.parse(row.payload), receivedAt: new Date(Number(row.received_at)).toISOString() };
        } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }

  async sendSnapshot(ws, symbols) {
    const quotes = await this.latestQuotes(symbols);
    if (!quotes.length) return;
    try {
      ws.send(JSON.stringify({ type: "snapshot", quotes, at: new Date().toISOString() }));
    } catch { }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const symbols = parseSymbols(url.searchParams.get("symbols"));
      server.serializeAttachment({ symbols });
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "ready", symbols, at: new Date().toISOString() }));
      await this.sendSnapshot(server, symbols);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/publish" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
      const quotes = Array.isArray(body?.quotes) ? body.quotes : [];
      if (!quotes.length) return json({ ok: true, delivered: 0 });
      let delivered = 0;
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() || {};
        const wanted = new Set(parseSymbols(attachment.symbols));
        const selected = wanted.size ? quotes.filter((quote) => wanted.has(String(quote?.symbol || "").toUpperCase())) : [];
        if (!selected.length) continue;
        try {
          ws.send(JSON.stringify({ type: "quotes", quotes: selected, at: new Date().toISOString() }));
          delivered += 1;
        } catch { }
      }
      return json({ ok: true, delivered });
    }

    return json({ ok: false, error: "not found" }, 404);
  }

  async webSocketMessage(ws, message) {
    let body;
    try { body = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); } catch { return; }
    if (body?.type === "subscribe") {
      const symbols = parseSymbols(body.symbols);
      ws.serializeAttachment({ symbols });
      ws.send(JSON.stringify({ type: "subscribed", symbols, at: new Date().toISOString() }));
      await this.sendSnapshot(ws, symbols);
      return;
    }
    if (body?.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong", at: new Date().toISOString() })); } catch { }
    }
  }

  async webSocketClose() {}
  async webSocketError() {}
}
