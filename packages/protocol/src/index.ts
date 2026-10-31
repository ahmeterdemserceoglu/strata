import { z } from 'zod';

// =============================================================================
// 1. GATEWAY OPCODES & CLOSE CODES
// =============================================================================

export enum GatewayOpcode {
  DISPATCH = 0,               // Server -> Client: Event
  HEARTBEAT = 1,              // Client <-> Server: Ping with last seq
  IDENTIFY = 2,               // Client -> Server: Initial auth & presence
  PRESENCE_UPDATE = 3,        // Client -> Server: Status/activity change
  VOICE_STATE_UPDATE = 4,     // Client -> Server: Join/leave/mute voice
  RESUME = 6,                 // Client -> Server: Resume dropped connection
  RECONNECT = 7,              // Server -> Client: Instruct client to reconnect & resume
  REQUEST_GUILD_MEMBERS = 8,  // Client -> Server: Query member chunk
  INVALID_SESSION = 9,        // Server -> Client: Session invalid (canResume: boolean)
  HELLO = 10,                 // Server -> Client: Heartbeat interval
  HEARTBEAT_ACK = 11,         // Server -> Client: Heartbeat acknowledged
  LAZY_GUILD_SUBSCRIBE = 12,  // Client -> Server: Subscribe to visible channel/member ranges
  TYPING_START = 13           // Client -> Server: Typing notification
}

export enum GatewayCloseCode {
  UNKNOWN_ERROR = 4000,
  UNKNOWN_OPCODE = 4001,
  DECODE_ERROR = 4002,
  NOT_AUTHENTICATED = 4003,
  AUTHENTICATION_FAILED = 4004,
  ALREADY_AUTHENTICATED = 4005,
  INVALID_SEQ = 4007,
  RATE_LIMITED = 4008,
  SESSION_TIMED_OUT = 4009,
  INVALID_VERSION = 4010,
  INVALID_CAPABILITIES = 4011,
  SERVER_REBALANCE = 4012
}

/** Whether the gateway close code indicates the connection can be resumed */
export function isResumableCloseCode(code: number): boolean {
  return [
    GatewayCloseCode.UNKNOWN_ERROR,
    GatewayCloseCode.DECODE_ERROR,
    GatewayCloseCode.SERVER_REBALANCE
  ].includes(code) || code < 4000;
}

// =============================================================================
// 2. GATEWAY EVENTS & FRAME SCHEMAS
// =============================================================================

export const GatewayEventNames = [
  'READY',
  'RESUMED',
  'GUILD_CREATE',
  'GUILD_UPDATE',
  'GUILD_DELETE',
  'GUILD_MEMBER_ADD',
  'GUILD_MEMBER_UPDATE',
  'GUILD_MEMBER_REMOVE',
  'GUILD_MEMBERS_CHUNK',
  'GUILD_MEMBER_LIST_UPDATE',
  'GUILD_ROLE_CREATE',
  'GUILD_ROLE_UPDATE',
  'GUILD_ROLE_DELETE',
  'GUILD_BAN_ADD',
  'GUILD_BAN_REMOVE',
  'GUILD_EMOJIS_UPDATE',
  'CHANNEL_CREATE',
  'CHANNEL_UPDATE',
  'CHANNEL_DELETE',
  'CHANNEL_PINS_UPDATE',
  'CHANNEL_RECIPIENT_ADD',
  'CHANNEL_RECIPIENT_REMOVE',
  'THREAD_CREATE',
  'THREAD_UPDATE',
  'THREAD_DELETE',
  'THREAD_MEMBERS_UPDATE',
  'MESSAGE_CREATE',
  'MESSAGE_UPDATE',
  'MESSAGE_DELETE',
  'MESSAGE_DELETE_BULK',
  'MESSAGE_REACTION_ADD',
  'MESSAGE_REACTION_REMOVE',
  'MESSAGE_REACTION_REMOVE_ALL',
  'MESSAGE_ACK',
  'TYPING_START',
  'PRESENCE_UPDATE',
  'RELATIONSHIP_ADD',
  'RELATIONSHIP_REMOVE',
  'USER_UPDATE',
  'USER_SETTINGS_UPDATE',
  'VOICE_STATE_UPDATE',
  'VOICE_SERVER_UPDATE',
  'SESSIONS_REPLACE'
] as const;

export type GatewayEventName = (typeof GatewayEventNames)[number];

export const GatewayFrameSchema = z.object({
  op: z.nativeEnum(GatewayOpcode),
  d: z.unknown(),
  s: z.number().int().nullable().optional(),
  t: z.string().nullable().optional()
});

export type GatewayFrame = z.infer<typeof GatewayFrameSchema>;

// Gateway Client Payload Schemas
export const IdentifyPayloadSchema = z.object({
  token: z.string().min(1),
  client: z.object({
    os: z.string(),
    clientType: z.enum(['web', 'desktop', 'mobile']),
    version: z.string()
  }),
  presence: z.object({
    status: z.enum(['online', 'idle', 'dnd', 'invisible', 'offline']),
    activity: z.string().nullable().optional()
  }).optional(),
  compress: z.boolean().optional().default(false)
});

export type IdentifyPayload = z.infer<typeof IdentifyPayloadSchema>;

export const ResumePayloadSchema = z.object({
  token: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().min(0)
});

export type ResumePayload = z.infer<typeof ResumePayloadSchema>;

export const VoiceStateUpdatePayloadSchema = z.object({
  guildId: z.string().nullable().optional(),
  channelId: z.string().nullable(),
  selfMute: z.boolean().default(false),
  selfDeaf: z.boolean().default(false),
  selfVideo: z.boolean().default(false),
  selfStream: z.boolean().default(false)
});

export type VoiceStateUpdatePayload = z.infer<typeof VoiceStateUpdatePayloadSchema>;

// =============================================================================
// 3. REST AUTH SCHEMAS & DTOS
// =============================================================================

export const RegisterDtoSchema = z.object({
  username: z
    .string()
    .min(2, 'Kullanıcı adı en az 2 karakter olmalıdır')
    .max(32, 'Kullanıcı adı en fazla 32 karakter olabilir')
    .regex(/^[a-z0-9_.]+$/, 'Kullanıcı adı yalnızca küçük harf, rakam, alt çizgi ve nokta içerebilir'),
  email: z.string().email('Geçerli bir e-posta adresi giriniz'),
  password: z
    .string()
    .min(8, 'Şifre en az 8 karakter olmalıdır')
    .max(128, 'Şifre çok uzun'),
  displayName: z.string().min(1).max(64).optional()
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  login: z.string().min(1, 'E-posta veya kullanıcı adı gereklidir'),
  password: z.string().min(1, 'Şifre gereklidir'),
  clientType: z.enum(['web', 'desktop', 'mobile']).default('web'),
  deviceName: z.string().max(100).optional()
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const TotpVerifyDtoSchema = z.object({
  ticket: z.string().min(1, 'MFA bileti gereklidir'),
  code: z.string().min(6).max(12, 'Geçerli bir 6 haneli TOTP kodu veya yedek kod giriniz')
});

export type TotpVerifyDto = z.infer<typeof TotpVerifyDtoSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable(),
    email: z.string(),
    avatarHash: z.string().nullable(),
    mfaEnabled: z.boolean()
  }),
  mfaRequired: z.boolean().optional(),
  mfaTicket: z.string().optional()
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// =============================================================================
// 4. REST ERROR FORMAT
// =============================================================================

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  errors: z.array(z.object({
    field: z.string(),
    message: z.string()
  })).optional()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
