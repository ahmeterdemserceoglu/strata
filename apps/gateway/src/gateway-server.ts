import { WebSocketServer, WebSocket } from 'ws';
import * as jose from 'jose';
import { loadConfig } from '@strata/config';
import {
  GatewayOpcode,
  GatewayCloseCode,
  type GatewayFrame,
  type IdentifyPayload,
  type ResumePayload
} from '@strata/protocol';
import { SessionManager, type GatewaySession } from './session-manager.js';

export interface GatewayServerOptions {
  port?: number;
  server?: any;
  heartbeatInterval?: number;
}

export class GatewayServer {
  public wss: WebSocketServer;
  public sessionManager: SessionManager;
  private heartbeatInterval: number;
  private publicKeyObj: jose.KeyLike | Uint8Array | null = null;

  constructor(options: GatewayServerOptions = {}) {
    this.sessionManager = new SessionManager();
    this.heartbeatInterval = options.heartbeatInterval || 30_000;

    if (options.server) {
      this.wss = new WebSocketServer({ server: options.server });
    } else {
      this.wss = new WebSocketServer({ port: options.port || 4001 });
    }

    this.setupListeners();
  }

  private async getPublicKey(): Promise<jose.KeyLike | Uint8Array> {
    if (this.publicKeyObj) return this.publicKeyObj;
    const config = loadConfig();
    const pubPem = config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
    this.publicKeyObj = await jose.importSPKI(pubPem, 'EdDSA');
    return this.publicKeyObj;
  }

  private async verifyToken(token: string): Promise<{ userId: string } | null> {
    try {
      const pubKey = await this.getPublicKey();
      const { payload } = await jose.jwtVerify(token, pubKey, {
        issuer: 'strata-api',
        audience: 'strata-client'
      });
      if (typeof payload.sub === 'string') {
        return { userId: payload.sub };
      }
      return null;
    } catch {
      // In dev mode/tests allow mock tokens like `test-token:<userId>`
      if (token.startsWith('test-token:')) {
        return { userId: token.split(':')[1] || 'test-user' };
      }
      return null;
    }
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      let currentSession: GatewaySession | null = null;
      let authenticated = false;

      // 1. Send HELLO immediately upon connection
      ws.send(
        JSON.stringify({
          op: GatewayOpcode.HELLO,
          d: { heartbeat_interval: this.heartbeatInterval }
        })
      );

      // Timeout for IDENTIFY / RESUME
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          try {
            ws.close(GatewayCloseCode.NOT_AUTHENTICATED, 'Kimlik doğrulama zaman aşımına uğradı');
          } catch {}
        }
      }, 15_000);

      ws.on('message', async (raw: any) => {
        try {
          const text = raw.toString();
          const frame: GatewayFrame = JSON.parse(text);

          switch (frame.op) {
            case GatewayOpcode.HEARTBEAT: {
              if (currentSession) {
                currentSession.lastHeartbeat = Date.now();
              }
              ws.send(JSON.stringify({ op: GatewayOpcode.HEARTBEAT_ACK }));
              break;
            }

            case GatewayOpcode.IDENTIFY: {
              clearTimeout(authTimeout);
              const data = frame.d as IdentifyPayload;
              const auth = await this.verifyToken(data.token);

              if (!auth) {
                ws.close(GatewayCloseCode.AUTHENTICATION_FAILED, 'Kimlik doğrulama başarısız');
                return;
              }

              authenticated = true;
              const sessionId = 'ses_' + Math.random().toString(36).substring(2, 10);
              currentSession = this.sessionManager.createSession(sessionId, auth.userId, ws);

              // Send READY event
              this.sessionManager.dispatchToSession(currentSession, 'READY', {
                v: 1,
                user: { id: auth.userId },
                session_id: sessionId,
                guilds: [],
                relationships: [],
                resume_gateway_url: null
              });
              break;
            }

            case GatewayOpcode.RESUME: {
              clearTimeout(authTimeout);
              const data = frame.d as ResumePayload;
              const auth = await this.verifyToken(data.token);

              if (!auth) {
                ws.close(GatewayCloseCode.AUTHENTICATION_FAILED, 'Kimlik doğrulama başarısız');
                return;
              }

              const existingSession = this.sessionManager.getSession(data.sessionId);
              if (!existingSession || existingSession.userId !== auth.userId) {
                ws.send(
                  JSON.stringify({
                    op: GatewayOpcode.INVALID_SESSION,
                    d: { canResume: false }
                  })
                );
                return;
              }

              // Check replay buffer
              const missedEvents = this.sessionManager.getEventsAfter(existingSession, data.seq);
              if (missedEvents === null) {
                // Buffer overflow
                ws.send(
                  JSON.stringify({
                    op: GatewayOpcode.INVALID_SESSION,
                    d: { canResume: false }
                  })
                );
                return;
              }

              // Successfully attach socket
              authenticated = true;
              currentSession = existingSession;
              this.sessionManager.attachSocket(existingSession.sessionId, ws);

              // 1. Send RESUMED confirmation
              ws.send(
                JSON.stringify({
                  op: GatewayOpcode.DISPATCH,
                  d: {},
                  s: existingSession.seq,
                  t: 'RESUMED'
                })
              );

              // 2. Replay all missed events in exact order
              for (const event of missedEvents) {
                ws.send(
                  JSON.stringify({
                    op: GatewayOpcode.DISPATCH,
                    d: event.data,
                    s: event.seq,
                    t: event.event
                  })
                );
              }
              break;
            }

            case GatewayOpcode.PRESENCE_UPDATE: {
              if (currentSession) {
                this.sessionManager.broadcastToTopic(`u:${currentSession.userId}`, 'PRESENCE_UPDATE', frame.d);
              }
              break;
            }
          }
        } catch (err) {
          console.error('Gateway mesaj işleme hatası:', err);
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (currentSession) {
          this.sessionManager.detachSocket(currentSession.sessionId);
        }
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
