import {
  GatewayOpcode,
  isResumableCloseCode,
  type GatewayFrame,
  type GatewayEventName
} from '@strata/protocol';

export type DispatchHandler = (event: GatewayEventName, data: unknown, seq: number) => void;

export interface GatewayClientOptions {
  url: string;
  token: string;
  clientInfo?: {
    os: string;
    clientType: 'web' | 'desktop' | 'mobile';
    version: string;
  };
  WebSocketClass?: unknown;
  reconnect?: boolean;
}

export class GatewayClient {
  private ws: any = null;
  private heartbeatTimer: any = null;
  private ackReceived: boolean = true;
  private seq: number = 0;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private closedIntentionally: boolean = false;
  private reconnectAttempts: number = 0;

  private dispatchListeners: DispatchHandler[] = [];
  private eventListeners = new Map<string, Array<(data: any) => void>>();

  constructor(private readonly options: GatewayClientOptions) {}

  public connect(): void {
    this.closedIntentionally = false;
    const WS = (this.options.WebSocketClass || (globalThis as any).WebSocket) as any;
    if (!WS) {
      throw new Error('WebSocket implementasyonu bulunamadi.');
    }

    const connectUrl = this.sessionId && this.resumeUrl ? this.resumeUrl : this.options.url;
    this.ws = new WS(connectUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: any) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event: any) => {
      this.cleanup();
      if (!this.closedIntentionally && this.options.reconnect !== false) {
        this.handleDisconnect(event.code);
      }
    };

    this.ws.onerror = (_err: any) => {
      // Handled by onclose
    };
  }

  public disconnect(): void {
    this.closedIntentionally = true;
    this.cleanup();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal Closure');
      } catch {}
      this.ws = null;
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getLastSeq(): number {
    return this.seq;
  }

  public onDispatch(handler: DispatchHandler): () => void {
    this.dispatchListeners.push(handler);
    return () => {
      this.dispatchListeners = this.dispatchListeners.filter((h) => h !== handler);
    };
  }

  public on<T = any>(event: GatewayEventName | 'READY' | 'RESUMED', handler: (data: T) => void): () => void {
    const list = this.eventListeners.get(event) || [];
    list.push(handler);
    this.eventListeners.set(event, list);
    return () => {
      const cur = this.eventListeners.get(event) || [];
      this.eventListeners.set(
        event,
        cur.filter((h) => h !== handler)
      );
    };
  }

  private handleMessage(raw: any): void {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      const frame: GatewayFrame = JSON.parse(text);

      switch (frame.op) {
        case GatewayOpcode.HELLO: {
          const { heartbeat_interval } = frame.d as { heartbeat_interval: number };
          this.startHeartbeat(heartbeat_interval);

          if (this.sessionId) {
            // Attempt RESUME
            this.sendFrame({
              op: GatewayOpcode.RESUME,
              d: {
                token: this.options.token,
                sessionId: this.sessionId,
                seq: this.seq
              }
            });
          } else {
            // Fresh IDENTIFY
            this.sendFrame({
              op: GatewayOpcode.IDENTIFY,
              d: {
                token: this.options.token,
                client: this.options.clientInfo || {
                  os: 'browser',
                  clientType: 'web',
                  version: '1.0.0'
                }
              }
            });
          }
          break;
        }

        case GatewayOpcode.HEARTBEAT_ACK: {
          this.ackReceived = true;
          break;
        }

        case GatewayOpcode.HEARTBEAT: {
          // Server requested heartbeat ping
          this.sendFrame({ op: GatewayOpcode.HEARTBEAT, d: this.seq });
          break;
        }

        case GatewayOpcode.DISPATCH: {
          if (typeof frame.s === 'number') {
            this.seq = frame.s;
          }

          const eventName = frame.t as GatewayEventName;

          if (eventName === 'READY') {
            const data = frame.d as { session_id: string; resume_gateway_url?: string };
            this.sessionId = data.session_id;
            this.resumeUrl = data.resume_gateway_url || null;
          }

          // Trigger generic dispatch listeners
          for (const listener of this.dispatchListeners) {
            listener(eventName, frame.d, this.seq);
          }

          // Trigger typed event listeners
          const typed = this.eventListeners.get(eventName);
          if (typed) {
            for (const h of typed) h(frame.d);
          }
          break;
        }

        case GatewayOpcode.INVALID_SESSION: {
          const canResume = Boolean((frame.d as any)?.canResume);
          if (!canResume) {
            this.sessionId = null;
            this.seq = 0;
          }
          // Re-identify
          this.sendFrame({
            op: GatewayOpcode.IDENTIFY,
            d: {
              token: this.options.token,
              client: this.options.clientInfo || {
                os: 'browser',
                clientType: 'web',
                version: '1.0.0'
              }
            }
          });
          break;
        }

        case GatewayOpcode.RECONNECT: {
          if (this.ws) {
            try {
              this.ws.close(4000, 'Server Requested Reconnect');
            } catch {}
          }
          break;
        }
      }
    } catch (err) {
      console.error('Gateway mesaj ayrıştırma hatası:', err);
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ackReceived = true;

    // First heartbeat has jitter
    const firstJitter = Math.floor(Math.random() * (intervalMs * 0.5));
    setTimeout(() => {
      this.sendHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (!this.ackReceived) {
          // Zombie connection detected!
          console.warn('⚠️ Gateway heartbeat ACK alınamadı (zombi bağlantı). Yeniden bağlanılıyor...');
          if (this.ws) {
            try {
              this.ws.close(4009, 'Heartbeat Timeout');
            } catch {}
          }
          return;
        }
        this.sendHeartbeat();
      }, intervalMs);
    }, firstJitter);
  }

  private sendHeartbeat(): void {
    this.ackReceived = false;
    this.sendFrame({
      op: GatewayOpcode.HEARTBEAT,
      d: this.seq
    });
  }

  private sendFrame(frame: GatewayFrame): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleDisconnect(code: number): void {
    const canResume = isResumableCloseCode(code);
    if (!canResume) {
      this.sessionId = null;
      this.seq = 0;
    }

    this.reconnectAttempts++;
    // Exponential backoff + jitter (min 500ms, max 10000ms)
    const baseDelay = Math.min(10000, 500 * Math.pow(1.5, this.reconnectAttempts));
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    setTimeout(() => {
      if (!this.closedIntentionally) {
        this.connect();
      }
    }, delay);
  }
}
