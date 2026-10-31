import type { GatewayEventName } from '@strata/protocol';

export interface BufferedEvent {
  seq: number;
  event: GatewayEventName;
  data: unknown;
  timestamp: number;
}

export interface GatewaySession {
  sessionId: string;
  userId: string;
  seq: number;
  replayBuffer: BufferedEvent[];
  lastHeartbeat: number;
  ws: any;
  subscriptions: Set<string>; // channel/guild/user topics
}

export class SessionManager {
  private sessions = new Map<string, GatewaySession>();
  private readonly maxBufferSize: number = 200;
  private readonly sessionTtlMs: number = 120_000; // 2 minutes to resume

  public createSession(sessionId: string, userId: string, ws: any): GatewaySession {
    const session: GatewaySession = {
      sessionId,
      userId,
      seq: 0,
      replayBuffer: [],
      lastHeartbeat: Date.now(),
      ws,
      subscriptions: new Set([`u:${userId}`])
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: string): GatewaySession | null {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    if (Date.now() - s.lastHeartbeat > this.sessionTtlMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    return s;
  }

  public attachSocket(sessionId: string, ws: any): GatewaySession | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    session.ws = ws;
    session.lastHeartbeat = Date.now();
    return session;
  }

  public detachSocket(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ws = null;
      session.lastHeartbeat = Date.now();
    }
  }

  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Pushes a dispatch event to a session, increments seq, saves in replay buffer,
   * and sends immediately if socket is connected.
   */
  public dispatchToSession(session: GatewaySession, event: GatewayEventName, data: unknown): BufferedEvent {
    session.seq += 1;
    const item: BufferedEvent = {
      seq: session.seq,
      event,
      data,
      timestamp: Date.now()
    };

    session.replayBuffer.push(item);
    if (session.replayBuffer.length > this.maxBufferSize) {
      session.replayBuffer.shift();
    }

    if (session.ws && session.ws.readyState === 1) {
      try {
        session.ws.send(
          JSON.stringify({
            op: 0, // DISPATCH
            d: data,
            s: session.seq,
            t: event
          })
        );
      } catch (err) {
        console.error('Mesaj gönderim hatası:', err);
      }
    }

    return item;
  }

  /**
   * Replays missed events for a resuming client from seq + 1 up to current seq.
   */
  public getEventsAfter(session: GatewaySession, afterSeq: number): BufferedEvent[] | null {
    if (afterSeq === session.seq) {
      return []; // Already up-to-date
    }

    const oldest = session.replayBuffer[0]?.seq ?? (session.seq + 1);
    if (afterSeq < oldest - 1) {
      // Replay buffer overflow: cannot resume!
      return null;
    }

    return session.replayBuffer.filter((e) => e.seq > afterSeq);
  }

  /**
   * Dispatches to all active sessions subscribed to topic (e.g. `g:guildId`, `c:channelId`, `u:userId`)
   * with optional permission check filter.
   */
  public broadcastToTopic(
    topic: string,
    event: GatewayEventName,
    data: unknown,
    permissionFilter?: (userId: string) => boolean
  ): void {
    for (const session of this.sessions.values()) {
      if (session.subscriptions.has(topic)) {
        if (permissionFilter && !permissionFilter(session.userId)) {
          // Access denied: skip this session
          continue;
        }
        this.dispatchToSession(session, event, data);
      }
    }
  }
}
