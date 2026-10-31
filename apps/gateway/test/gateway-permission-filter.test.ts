import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { GatewayServer } from '../src/gateway-server.js';
import { GatewayClient } from '@strata/sdk';

describe('Gateway Permission Filter Integration Test', () => {
  let server: GatewayServer;
  const testPort = 4568;
  const testUrl = `ws://127.0.0.1:${testPort}`;

  beforeAll(async () => {
    server = new GatewayServer({
      port: testPort,
      heartbeatInterval: 2000
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('Channel event is ONLY delivered to users with VIEW_CHANNEL permission', async () => {
    const userA_Token = 'test-token:usr_authorized';
    const userB_Token = 'test-token:usr_forbidden';

    // 1. Connect User A (Authorized)
    const clientA = new GatewayClient({
      url: testUrl,
      token: userA_Token,
      WebSocketClass: WebSocket,
      reconnect: false
    });

    // 2. Connect User B (Forbidden)
    const clientB = new GatewayClient({
      url: testUrl,
      token: userB_Token,
      WebSocketClass: WebSocket,
      reconnect: false
    });

    const readyA = new Promise<void>((res) => clientA.on('READY', () => res()));
    const readyB = new Promise<void>((res) => clientB.on('READY', () => res()));

    clientA.connect();
    clientB.connect();
    await Promise.all([readyA, readyB]);

    // Both users subscribe to guild topic `g:guild_100`
    const sessionA = server.sessionManager.getSession(clientA.getSessionId()!);
    const sessionB = server.sessionManager.getSession(clientB.getSessionId()!);
    sessionA?.subscriptions.add('g:guild_100');
    sessionB?.subscriptions.add('g:guild_100');

    const receivedA: any[] = [];
    const receivedB: any[] = [];

    clientA.on('MESSAGE_CREATE', (data) => receivedA.push(data));
    clientB.on('MESSAGE_CREATE', (data) => receivedB.push(data));

    // Permission filter function: only 'usr_authorized' has VIEW_CHANNEL
    const hasViewChannelPermission = (userId: string) => userId === 'usr_authorized';

    // Broadcast message to guild channel
    server.sessionManager.broadcastToTopic(
      'g:guild_100',
      'MESSAGE_CREATE',
      { channel_id: 'chan_vip', content: 'Top Secret Message' },
      hasViewChannelPermission
    );

    // Wait 200ms
    await new Promise((r) => setTimeout(r, 200));

    // Verify User A received the message, but User B NEVER received it!
    expect(receivedA.length).toBe(1);
    expect(receivedA[0]?.content).toBe('Top Secret Message');

    expect(receivedB.length).toBe(0); // Forbidden user received 0 events!

    clientA.disconnect();
    clientB.disconnect();
  });
});
