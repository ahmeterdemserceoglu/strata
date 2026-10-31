import type { Generated } from 'kysely';

export interface UsersTable {
  id: string; // Snowflake
  username: string; // unique, citext
  display_name: string | null;
  email: string; // unique, citext
  email_verified: boolean;
  password_hash: string | null;
  avatar_hash: string | null;
  banner_hash: string | null;
  bio: string | null;
  flags: number;
  mfa_enabled: boolean;
  mfa_secret_enc: string | null; // AES-256-GCM encrypted
  token_version: number;
  locale: string;
  created_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface UserSettingsTable {
  user_id: string;
  settings: string; // JSONB
  version: number;
  updated_at: Generated<Date>;
}

export interface MfaBackupCodesTable {
  id: Generated<string>;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
}

export interface OAuthAccountsTable {
  id: Generated<string>;
  provider: 'google' | 'github';
  provider_user_id: string;
  user_id: string;
  email: string;
  created_at: Generated<Date>;
}

export interface AuthSessionsTable {
  id: string; // Snowflake or UUID
  user_id: string;
  device_name: string | null;
  client_type: 'web' | 'desktop' | 'mobile';
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
  last_used_at: Generated<Date>;
  revoked_at: Date | null;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  token_hash: string; // SHA-256
  session_id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  user_settings: UserSettingsTable;
  mfa_backup_codes: MfaBackupCodesTable;
  oauth_accounts: OAuthAccountsTable;
  auth_sessions: AuthSessionsTable;
  refresh_tokens: RefreshTokensTable;
}
