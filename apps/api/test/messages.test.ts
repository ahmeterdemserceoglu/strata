import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { InMemoryAuthStore } from '../src/services/auth-store.js';
import { GuildService } from '../src/services/guild-service.js';
import { MessageService } from '../src/services/message-service.js';

describe('Message Service & Nonce Idempotency Integration Tests', () => {
  let app: FastifyInstance;
  let messageService: MessageService;
  let userToken: string;
  let otherUserToken: string;
  let channelId: string;

  beforeAll(async () => {
    const authStore = new InMemoryAuthStore();
    const guildService = new GuildService();
    messageService = new MessageService();

    app = buildServer(authStore, guildService, messageService);

    // Register primary user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'msg_author',
        email: 'author@strata.chat',
        password: 'Password123!'
      }
    });
    userToken = regRes.json().accessToken;

    // Register second user
    const regRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'msg_other',
        email: 'other@strata.chat',
        password: 'Password123!'
      }
    });
    otherUserToken = regRes2.json().accessToken;

    // Create a guild & channel
    const guildRes = await app.inject({
      method: 'POST',
      url: '/api/v1/guilds',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { name: 'Test Gaming' }
    });
    channelId = guildRes.json().defaultChannelId;
  });

  it('Nonce Idempotency: Double-submitting same nonce produces NO duplicate messages', async () => {
    const testNonce = 'nonce_unique_12345';

    // First send
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        content: 'Hello World Nonce Test',
        nonce: testNonce
      }
    });

    expect(res1.statusCode).toBe(201);
    const msg1 = res1.json();
    expect(msg1.id).toBeDefined();

    // Second send (network retry with same nonce)
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        content: 'Hello World Nonce Test',
        nonce: testNonce
      }
    });

    expect(res2.statusCode).toBe(200); // 200 OK idempotent response
    const msg2 = res2.json();
    expect(msg2.id).toBe(msg1.id); // Exactly same message returned!

    // Verify channel message count is still 1
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/channels/${channelId}/messages`,
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(listRes.json().messages.length).toBe(1);
  });

  it('Message editing and delete permissions', async () => {
    // 1. Send message
    const sendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { content: 'Initial Content' }
    });
    const msgId = sendRes.json().id;

    // 2. Other user cannot edit
    const unauthorizedEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${channelId}/messages/${msgId}`,
      headers: { Authorization: `Bearer ${otherUserToken}` },
      payload: { content: 'Hacked Content' }
    });
    expect(unauthorizedEdit.statusCode).toBe(403);

    // 3. Author can edit
    const authorEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${channelId}/messages/${msgId}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: { content: 'Updated Content' }
    });
    expect(authorEdit.statusCode).toBe(200);
    expect(authorEdit.json().content).toBe('Updated Content');
    expect(authorEdit.json().editedAt).toBeDefined();

    // 4. Author can delete
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${channelId}/messages/${msgId}`,
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(deleteRes.statusCode).toBe(204);
  });

  it('Slowmode blocks rapid consecutive messages', async () => {
    const slowChannel = 'chan_slow_100';

    // First send under 5-second slowmode
    const res1 = await messageService.sendMessage({
      channelId: slowChannel,
      authorId: 'usr_chatter',
      content: 'First fast message',
      slowmodeSeconds: 5,
      isModerator: false
    });
    expect(res1.message.id).toBeDefined();

    // Immediate second send fails
    await expect(
      messageService.sendMessage({
        channelId: slowChannel,
        authorId: 'usr_chatter',
        content: 'Second too fast message',
        slowmodeSeconds: 5,
        isModerator: false
      })
    ).rejects.toThrow('Yavaş mod aktif');

    // Moderator bypasses slowmode
    const modRes = await messageService.sendMessage({
      channelId: slowChannel,
      authorId: 'usr_mod',
      content: 'Mod message',
      slowmodeSeconds: 5,
      isModerator: true
    });
    expect(modRes.message.id).toBeDefined();
  });
});
