import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GatewayOpcode } from '@strata/protocol';
import { verifyAccessToken } from './crypto/jwt.js';

interface ConnectedClient {
  ws: WebSocket;
  userId: string | null;
  seq: number;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ConnectedClient>();

  public attach(httpServer: HttpServer): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server: httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      const client: ConnectedClient = { ws, userId: null, seq: 0 };
      this.clients.add(client);

      // Send HELLO frame
      ws.send(
        JSON.stringify({
          op: GatewayOpcode.HELLO,
          d: { heartbeat_interval: 25000 }
        })
      );

      ws.on('message', async (raw: any) => {
        try {
          const frame = JSON.parse(raw.toString());
          if (frame.op === GatewayOpcode.HEARTBEAT) {
            ws.send(JSON.stringify({ op: GatewayOpcode.HEARTBEAT_ACK }));
          } else if (frame.op === GatewayOpcode.IDENTIFY) {
            const token = frame.d?.token;
            if (typeof token === 'string') {
              const claims = await verifyAccessToken(token);
              if (claims) {
                client.userId = claims.sub;
                client.seq += 1;
                ws.send(
                  JSON.stringify({
                    op: GatewayOpcode.DISPATCH,
                    t: 'READY',
                    s: client.seq,
                    d: {
                      session_id: `sess_${claims.sub}_${Date.now()}`,
                      resume_gateway_url: '',
                      user: { id: claims.sub }
                    }
                  })
                );
                this.broadcastPresenceCount();
              }
            }
          }
        } catch {
          // Ignore malformed WS frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        this.broadcastPresenceCount();
      });

      ws.on('error', () => {
        this.clients.delete(client);
      });
    });
  }

  public broadcast(event: string, payload: unknown): void {
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.seq += 1;
        client.ws.send(
          JSON.stringify({
            op: GatewayOpcode.DISPATCH,
            t: event,
            s: client.seq,
            d: payload
          })
        );
      }
    }
  }

  public getOnlineUserIds(): string[] {
    const ids = new Set<string>();
    for (const client of this.clients) {
      if (client.userId && client.ws.readyState === WebSocket.OPEN) {
        ids.add(client.userId);
      }
    }
    return Array.from(ids);
  }

  private broadcastPresenceCount(): void {
    this.broadcast('PRESENCE_UPDATE', {
      onlineUserIds: this.getOnlineUserIds(),
      onlineCount: this.getOnlineUserIds().length
    });
  }
}

export const realtimeHub = new RealtimeHub();

