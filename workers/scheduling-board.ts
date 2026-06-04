import { DurableObject } from "cloudflare:workers";

/**
 * Per-organization scheduling board Durable Object. Holds a set of
 * WebSocket sessions and broadcasts scheduler-relevant events to them
 * so the admin board, the parent portal, and the instructor "today"
 * surface update within a second of any change — per spec module #2's
 * "real-time via Durable Objects" requirement.
 *
 * Event shape (JSON):
 *   { kind: 'appointment.created' | 'appointment.canceled' |
 *           'appointment.completed' | 'appointment.no_show' |
 *           'shift.started' | 'shift.ended' | 'series.created',
 *     orgId: string, ...payload }
 *
 * One DO instance per organization, addressed via env.SCHEDULING_BOARD
 * .idFromName(orgId). The DB write happens first; notifyBoard() is
 * called from the action with the resulting event after success.
 */
export class SchedulingBoardDO extends DurableObject<Env> {
  private sessions: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const server = pair[1];
      this.handleSession(server);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const body = await request.text();
      this.broadcast(body);
      return new Response("ok");
    }

    if (url.pathname === "/sessions" && request.method === "GET") {
      return Response.json({ sessions: this.sessions.size });
    }

    return new Response("not found", { status: 404 });
  }

  private handleSession(ws: WebSocket): void {
    ws.accept();
    this.sessions.add(ws);
    const onClose = () => this.sessions.delete(ws);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onClose);
    // Initial hello so the client knows the connection is live.
    try {
      ws.send(JSON.stringify({ kind: "hello", sessions: this.sessions.size }));
    } catch {
      this.sessions.delete(ws);
    }
  }

  private broadcast(message: string): void {
    const dead: WebSocket[] = [];
    for (const ws of this.sessions) {
      try {
        ws.send(message);
      } catch {
        dead.push(ws);
      }
    }
    for (const ws of dead) this.sessions.delete(ws);
  }
}
