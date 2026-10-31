import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { GatewayServer } from '../src/gateway-server.js';
import { GatewayClient } from '@strata/sdk';
import { GatewayOpcode } from '@strata/protocol';

describe('Gateway Core & Resume Integration Tests', () => {
  let server: GatewayServer;
  const testPort = 4567;
  const testUrl = `ws://127.0.0.1:${testPort}`;
  const testToken = 'test-token:usr_tester_99';

  beforeAll(async () => {
    server = new GatewayServer({
      port: testPort,
      heartbeatInterval: 1000 // Fast heartbeat for tests
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('Handshake: receives HELLO, sends IDENTIFY, receives READY', async () => {
    const client = new GatewayClient({
      url: testUrl,
      token: testToken,
      WebSocketClass: WebSocket,
      reconnect: false
    });

    const readyPromise = new Promise<{ session_id: string }>((resolve) => {
      client.on('READY', (data) => resolve(data));
    });

    client.connect();
    const readyData = await readyPromise;

    expect(readyData.session_id).toBeDefined();
    expect(client.getSessionId()).toBe(readyData.session_id);
    expect(client.getLastSeq()).toBe(1); // READY is seq 1

    client.disconnect();
  });

  it('Resume Protocol: disconnects, buffers events on server, resumes with zero event loss', async () => {
    const client = new GatewayClient({
      url: testUrl,
      token: testToken,
      WebSocketClass: WebSocket,
      reconnect: false
    });

    const readyPromise = new Promise<{ session_id: string }>((resolve) => {
      client.on('READY', (data) => resolve(data));
    });

    client.connect();
    const readyData = await readyPromise;
    const sessionId = readyData.session_id;

    // Disconnect client socket explicitly without clearing session state
    client.disconnect();

    // While client is disconnected, simulate 3 events being sent to this session
    const session = server.sessionManager.getSession(sessionId);
    expect(session).not.toBeNull();

    server.sessionManager.dispatchToSession(session!, 'MESSAGE_CREATE', { content: 'Message 1' });
    server.sessionManager.dispatchToSession(session!, 'MESSAGE_CREATE', { content: 'Message 2' });
    server.sessionManager.dispatchToSession(session!, 'MESSAGE_CREATE', { content: 'Message 3' });

    expect(session!.seq).toBe(4); // Seq 1 was READY, then 2, 3, 4

    // Now connect with a resuming client using same sessionId & lastSeq=1
    const resumedEvents: Array<{ event: string; data: any; seq: number }> = [];

    const resumeSocket = new WebSocket(testUrl);

    await new Promise<void>((resolve, reject) => {
      resumeSocket.on('open', () => {
        // Wait for HELLO
        resumeSocket.on('message', (raw) => {
          const frame = JSON.parse(raw.toString());
          if (frame.op === GatewayOpcode.HELLO) {
            // Send RESUME with last seen seq = 1
            resumeSocket.send(
              JSON.stringify({
                op: GatewayOpcode.RESUME,
                d: {
                  token: testToken,
                  sessionId,
                  seq: 1
                }
              })
            );
          } else if (frame.op === GatewayOpcode.DISPATCH) {
            resumedEvents.push({ event: frame.t, data: frame.d, seq: frame.s });
            if (resumedEvents.length === 4) {
              // 1 (RESUMED) + 3 (MESSAGE_CREATE events)
              resolve();
            }
          }
        });
      });

      resumeSocket.on('error', reject);
    });

    resumeSocket.close();

    // Verify all missed events replayed in exact order
    expect(resumedEvents[0]?.event).toBe('RESUMED');
    expect(resumedEvents[1]?.event).toBe('MESSAGE_CREATE');
    expect(resumedEvents[1]?.data.content).toBe('Message 1');
    expect(resumedEvents[1]?.seq).toBe(2);

    expect(resumedEvents[2]?.event).toBe('MESSAGE_CREATE');
    expect(resumedEvents[2]?.data.content).toBe('Message 2');
    expect(resumedEvents[2]?.seq).toBe(3);

    expect(resumedEvents[3]?.event).toBe('MESSAGE_CREATE');
    expect(resumedEvents[3]?.data.content).toBe('Message 3');
    expect(resumedEvents[3]?.seq).toBe(4);
  });
});
