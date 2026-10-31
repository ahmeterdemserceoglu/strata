import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { loadConfig } from '@strata/config';
import {
  RegisterDtoSchema,
  LoginDtoSchema,
  TotpVerifyDtoSchema,
  type ApiError
} from '@strata/protocol';
import { AuthService } from './services/auth-service.js';
import { InMemoryAuthStore, type IAuthStore } from './services/auth-store.js';
import { GuildService } from './services/guild-service.js';
import { MessageService } from './services/message-service.js';
import { globalRateLimiter } from './services/rate-limiter.js';
import { verifyAccessToken, getJwks } from './crypto/jwt.js';
import { realtimeHub } from './realtime.js';

export function buildServer(
  customStore?: IAuthStore,
  customGuildService?: GuildService,
  customMessageService?: MessageService
): FastifyInstance {
  const config = loadConfig();
  const store = customStore || new InMemoryAuthStore();
  const authService = new AuthService(store);
  const guildService = customGuildService || new GuildService();
  const messageService = customMessageService || new MessageService();

  const server = Fastify({
    logger: false
  });

  server.register(helmet, { contentSecurityPolicy: false });
  server.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  server.register(cookie);

  // Rate Limiter PreHandler Hook for Auth Routes
  server.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/v1/auth/')) {
      const ip = req.ip || '127.0.0.1';
      const key = `rl:auth:${ip}:${req.routeOptions?.url || req.url}`;
      // Allow 60 requests per minute per IP for auth (supports 100+ users on shared LAN/NAT)
      const result = globalRateLimiter.check(key, 60, 60);

      reply.header('X-RateLimit-Limit', result.limit.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', result.resetSeconds.toString());

      if (!result.allowed) {
        reply.header('Retry-After', result.resetSeconds.toString());
        return reply.status(429).send({
          code: 'RATE_LIMITED',
          message: 'Çok fazla istek yapıldı. Lütfen daha sonra tekrar deneyin.'
        });
      }
    }
  });

  // Global Error Handler
  server.setErrorHandler((error: unknown, _req, reply) => {
    const err = error as { statusCode?: number; code?: string; message?: string };
    const status = err.statusCode || 400;
    const response: ApiError = {
      code: err.code || 'BAD_REQUEST',
      message: err.message || 'Bir hata oluştu.'
    };
    return reply.status(status).send(response);
  });

  // Auth Bearer Token Helper
  async function authenticateUser(req: FastifyRequest) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw { statusCode: 401, code: 'UNAUTHORIZED', message: 'Yetkilendirme başlığı eksik.' };
    }
    const token = authHeader.substring(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      throw { statusCode: 401, code: 'UNAUTHORIZED', message: 'Geçersiz veya süresi dolmuş token.' };
    }
    return claims;
  }

  // ---------------------------------------------------------------------------
  // SYSTEM & HEALTH ENDPOINTS
  // ---------------------------------------------------------------------------
  server.get('/', async () => ({ service: 'strata-api', status: 'online', onlineUsers: realtimeHub.getOnlineUserIds().length }));
  server.get('/health/live', async () => ({ status: 'ok', onlineUsers: realtimeHub.getOnlineUserIds().length }));
  server.get('/health/ready', async () => ({ status: 'ready', timestamp: new Date().toISOString() }));
  server.get('/.well-known/jwks.json', async () => getJwks());

  // ---------------------------------------------------------------------------
  // AUTH ENDPOINTS
  // ---------------------------------------------------------------------------
  server.post('/api/v1/auth/register', async (req, reply) => {
    const parse = RegisterDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: parse.error.issues[0]?.message || 'Doğrulama hatası',
        errors: parse.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      });
    }

    try {
      const clientType = ((req.headers['x-client-type'] as string) || 'web') as 'web' | 'desktop' | 'mobile';
      const result = await authService.register(
        parse.data,
        clientType,
        req.headers['user-agent'],
        req.ip,
        req.headers['user-agent']
      );

      reply.setCookie('strata_refresh', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60
      });

      return reply.status(201).send({
        accessToken: result.accessToken,
        refreshToken: clientType !== 'web' ? result.refreshToken : undefined,
        expiresIn: result.expiresInSeconds,
        user: result.user
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kayıt başarısız.';
      return reply.status(400).send({ code: 'REGISTRATION_FAILED', message });
    }
  });

  server.post('/api/v1/auth/login', async (req, reply) => {
    const parse = LoginDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: parse.error.issues[0]?.message || 'Doğrulama hatası',
        errors: parse.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      });
    }

    try {
      const result = await authService.login(parse.data, req.ip, req.headers['user-agent']);

      if (result.mfaRequired) {
        return reply.status(200).send({
          mfaRequired: true,
          mfaTicket: result.mfaTicket
        });
      }

      const { tokens } = result;
      reply.setCookie('strata_refresh', tokens.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60
      });

      return reply.status(200).send({
        accessToken: tokens.accessToken,
        refreshToken: parse.data.clientType !== 'web' ? tokens.refreshToken : undefined,
        expiresIn: tokens.expiresInSeconds,
        user: tokens.user
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Giriş başarısız.';
      return reply.status(401).send({ code: 'INVALID_CREDENTIALS', message });
    }
  });

  server.get('/api/v1/auth/me', async (req, reply) => {
    const claims = await authenticateUser(req);
    const user = await store.findUserById(claims.sub);
    if (!user) {
      return reply.status(404).send({ code: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    }
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarHash: user.avatarHash,
        mfaEnabled: user.mfaEnabled
      }
    };
  });

  server.post('/api/v1/auth/mfa/totp', async (req, reply) => {
    const parse = TotpVerifyDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: parse.error.issues[0]?.message || 'Doğrulama hatası',
        errors: parse.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      });
    }

    try {
      const tokens = await authService.verifyMfaTotp(parse.data.ticket, parse.data.code);

      reply.setCookie('strata_refresh', tokens.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60
      });

      return reply.status(200).send({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresInSeconds,
        user: tokens.user
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'MFA doğrulaması başarısız.';
      return reply.status(401).send({ code: 'MFA_FAILED', message });
    }
  });

  server.post('/api/v1/auth/refresh', async (req, reply) => {
    const bodyToken = (req.body as { refreshToken?: string })?.refreshToken;
    const cookieToken = req.cookies['strata_refresh'];
    const rawToken = bodyToken || cookieToken;

    if (!rawToken) {
      return reply.status(401).send({
        code: 'MISSING_TOKEN',
        message: 'Yenileme belirteci bulunamadı.'
      });
    }

    try {
      const result = await authService.refreshToken(rawToken);

      reply.setCookie('strata_refresh', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60
      });

      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresInSeconds
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Yenileme başarısız.';
      return reply.status(401).send({ code: 'REFRESH_FAILED', message });
    }
  });

  server.post('/api/v1/auth/logout', async (req, reply) => {
    try {
      const claims = await authenticateUser(req);
      await authService.logout(claims.sid);
    } catch {
      // Ignored for graceful logout
    }

    reply.clearCookie('strata_refresh', { path: '/api/v1/auth/refresh' });
    return reply.status(204).send();
  });

  server.get('/api/v1/auth/sessions', async (req) => {
    const claims = await authenticateUser(req);
    const sessions = await store.findSessionsByUserId(claims.sub);
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        clientType: s.clientType,
        ip: s.ip,
        isCurrent: s.id === claims.sid,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt
      }))
    };
  });

  server.delete('/api/v1/auth/sessions/:id', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id } = req.params as { id: string };
    const session = await store.findSessionById(id);

    if (!session || session.userId !== claims.sub) {
      return reply.status(404).send({ code: 'SESSION_NOT_FOUND', message: 'Oturum bulunamadı.' });
    }

    await store.revokeSession(id);
    return reply.status(204).send();
  });

  server.get('/api/v1/auth/oauth/providers', async () => {
    const providers: string[] = [];
    if (config.GOOGLE_CLIENT_ID) providers.push('google');
    if (config.GITHUB_CLIENT_ID) providers.push('github');
    return { providers };
  });

  // ---------------------------------------------------------------------------
  // 2FA / MFA SETUP ENDPOINTS
  // ---------------------------------------------------------------------------
  server.post('/api/v1/users/@me/mfa/totp/setup', async (req) => {
    const claims = await authenticateUser(req);
    const result = await authService.setupMfa(claims.sub);
    return {
      secret: result.secretBase32,
      backupCodes: result.backupCodes,
      otpauthUrl: `otpauth://totp/Strata:${claims.sub}?secret=${result.secretBase32}&issuer=Strata`
    };
  });

  server.post('/api/v1/users/@me/mfa/totp/enable', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { code } = req.body as { code: string };
    if (!code) {
      return reply.status(400).send({ code: 'CODE_REQUIRED', message: 'Onay kodu zorunludur.' });
    }

    await authService.enableMfa(claims.sub, code);
    return { success: true, message: 'İki faktörlü doğrulama başarıyla aktifleştirildi.' };
  });

  server.post('/api/v1/users/@me/mfa/totp/disable', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { code } = req.body as { code: string };
    if (!code) {
      return reply.status(400).send({ code: 'CODE_REQUIRED', message: 'Onay kodu zorunludur.' });
    }

    await authService.disableMfa(claims.sub, code);
    return { success: true, message: 'İki faktörlü doğrulama devre dışı bırakıldı.' };
  });

  // ---------------------------------------------------------------------------
  // GUILD & CHANNEL ENDPOINTS
  // ---------------------------------------------------------------------------
  server.get('/api/v1/users/@me/guilds', async (req) => {
    const claims = await authenticateUser(req);
    const guilds = guildService.getMemberGuilds(claims.sub);
    return { guilds };
  });

  server.post('/api/v1/guilds', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { name } = (req.body as { name?: string }) || {};
    if (!name || name.trim().length < 2) {
      return reply.status(400).send({ code: 'INVALID_NAME', message: 'Sunucu adı en az 2 karakter olmalıdır.' });
    }

    const { guild, defaultChannelId } = await guildService.createGuild(claims.sub, name.trim());
    return reply.status(201).send({ guild, defaultChannelId });
  });

  server.get('/api/v1/guilds/:id', async (req, reply) => {
    await authenticateUser(req);
    const { id } = req.params as { id: string };
    const guild = guildService.getGuild(id);
    if (!guild) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return guild;
  });

  server.get('/api/v1/guilds/:id/members', async (req, reply) => {
    await authenticateUser(req);
    const { id } = req.params as { id: string };
    const guild = guildService.getGuild(id);
    if (!guild) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Sunucu bulunamadı.' });

    const members = guildService.members.get(id) || [];
    const enriched = await Promise.all(
      members.map(async (m) => {
        const u = await store.findUserById(m.userId);
        return {
          userId: m.userId,
          username: u?.username || `kullanici_${m.userId.slice(-4)}`,
          displayName: u?.displayName || u?.username || null,
          joinedAt: m.joinedAt
        };
      })
    );
    return { members: enriched };
  });

  server.get('/api/v1/guilds/:id/channels', async (req) => {
    const claims = await authenticateUser(req);
    const { id } = req.params as { id: string };
    const channels = guildService.getGuildChannels(id);

    const visibleChannels = channels.filter((c) => {
      const perms = guildService.getChannelPermissions(id, c.id, claims.sub);
      return (perms & 1024n) === 1024n; // Permissions.VIEW_CHANNEL
    });

    return { channels: visibleChannels };
  });

  server.post('/api/v1/channels/:id/invites', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id } = req.params as { id: string };
    try {
      const invite = guildService.createInvite(id, claims.sub);
      return reply.status(201).send({ invite });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Davet oluşturulamadı.';
      return reply.status(403).send({ code: 'FORBIDDEN', message });
    }
  });

  server.post('/api/v1/invites/:code', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { code } = req.params as { id?: string; code: string };
    try {
      const result = guildService.joinViaInvite(code.trim(), claims.sub);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Davet bağlantısına katılım başarısız.';
      return reply.status(400).send({ code: 'INVITE_FAILED', message });
    }
  });

  // ---------------------------------------------------------------------------
  // MESSAGE & CHANNEL INTERACTION ENDPOINTS
  // ---------------------------------------------------------------------------
  server.post('/api/v1/channels/:id/messages', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id: channelId } = req.params as { id: string };
    const { content, nonce, message_reference } = (req.body as any) || {};

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ code: 'INVALID_CONTENT', message: 'Mesaj içeriği boş olamaz.' });
    }

    try {
      const author = await store.findUserById(claims.sub);
      const result = await messageService.sendMessage({
        channelId,
        authorId: claims.sub,
        content: content.trim(),
        nonce,
        messageReferenceId: message_reference?.message_id
      });

      const outgoingMessage = {
        id: result.message.id,
        channelId: result.message.channelId,
        authorId: result.message.authorId,
        authorUsername: author?.username || `kullanici_${claims.sub.slice(-4)}`,
        authorDisplayName: author?.displayName || author?.username || null,
        content: result.message.content,
        nonce: result.message.nonce,
        pinned: result.message.pinned,
        mentionUsers: result.message.mentionUsers,
        mentionEveryone: result.message.mentionEveryone,
        createdAt: result.message.createdAt
      };

      if (!result.duplicate) {
        realtimeHub.broadcast('MESSAGE_CREATE', outgoingMessage);
      }

      return reply.status(result.duplicate ? 200 : 201).send(outgoingMessage);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mesaj gönderilemedi.';
      return reply.status(400).send({ code: 'SEND_FAILED', message });
    }
  });

  server.get('/api/v1/channels/:id/messages', async (req) => {
    await authenticateUser(req);
    const { id: channelId } = req.params as { id: string };
    const { before, after, limit } = (req.query as any) || {};

    const messages = messageService.getMessages(channelId, {
      before,
      after,
      limit: limit ? parseInt(limit, 10) : 50
    });

    const enriched = await Promise.all(
      messages.map(async (m) => {
        const author = await store.findUserById(m.authorId);
        return {
          id: m.id,
          channelId: m.channelId,
          authorId: m.authorId,
          authorUsername: author?.username || `kullanici_${m.authorId.slice(-4)}`,
          authorDisplayName: author?.displayName || author?.username || null,
          content: m.content,
          nonce: m.nonce,
          pinned: m.pinned,
          editedAt: m.editedAt,
          mentionUsers: m.mentionUsers,
          mentionEveryone: m.mentionEveryone,
          reactions: Object.fromEntries(
            Array.from(m.reactions.entries()).map(([k, v]) => [k, Array.from(v)])
          ),
          createdAt: m.createdAt
        };
      })
    );

    return { messages: enriched };
  });

  server.patch('/api/v1/channels/:id/messages/:msgId', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id: channelId, msgId } = req.params as { id: string; msgId: string };
    const { content } = (req.body as any) || {};

    if (!content || typeof content !== 'string') {
      return reply.status(400).send({ code: 'INVALID_CONTENT', message: 'İçerik gereklidir.' });
    }

    try {
      const updated = await messageService.editMessage(channelId, msgId, claims.sub, content.trim());
      return {
        id: updated.id,
        content: updated.content,
        editedAt: updated.editedAt
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mesaj düzenlenemedi.';
      return reply.status(403).send({ code: 'FORBIDDEN', message });
    }
  });

  server.delete('/api/v1/channels/:id/messages/:msgId', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id: channelId, msgId } = req.params as { id: string; msgId: string };

    try {
      await messageService.deleteMessage(channelId, msgId, claims.sub);
      return reply.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mesaj silinemedi.';
      return reply.status(403).send({ code: 'FORBIDDEN', message });
    }
  });

  server.post('/api/v1/channels/:id/messages/:msgId/ack', async (req, reply) => {
    const claims = await authenticateUser(req);
    const { id: channelId, msgId } = req.params as { id: string; msgId: string };

    messageService.ackMessage(channelId, claims.sub, msgId);
    return reply.status(204).send();
  });

  return server;
}

