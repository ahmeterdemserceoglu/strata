import { describe, it, expect } from 'vitest';
import {
  GatewayOpcode,
  GatewayCloseCode,
  isResumableCloseCode,
  GatewayFrameSchema,
  RegisterDtoSchema,
  LoginDtoSchema
} from '../src/index.js';

describe('Protocol Specifications', () => {
  it('should validate valid GatewayFrame', () => {
    const frame = {
      op: GatewayOpcode.DISPATCH,
      d: { hello: 'world' },
      s: 42,
      t: 'MESSAGE_CREATE'
    };
    const parsed = GatewayFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
  });

  it('should identify resumable close codes', () => {
    expect(isResumableCloseCode(GatewayCloseCode.UNKNOWN_ERROR)).toBe(true);
    expect(isResumableCloseCode(GatewayCloseCode.SERVER_REBALANCE)).toBe(true);
    expect(isResumableCloseCode(GatewayCloseCode.AUTHENTICATION_FAILED)).toBe(false);
    expect(isResumableCloseCode(GatewayCloseCode.SESSION_TIMED_OUT)).toBe(false);
  });

  it('should validate RegisterDto correctly', () => {
    const valid = {
      username: 'strata_user.99',
      email: 'user@strata.chat',
      password: 'StrongPassword123!',
      displayName: 'Strata Pioneer'
    };
    expect(RegisterDtoSchema.safeParse(valid).success).toBe(true);

    const invalidUsername = {
      username: 'Invalid USER Name!',
      email: 'user@strata.chat',
      password: 'password123'
    };
    expect(RegisterDtoSchema.safeParse(invalidUsername).success).toBe(false);

    const shortPassword = {
      username: 'valid_user',
      email: 'user@strata.chat',
      password: '123'
    };
    expect(RegisterDtoSchema.safeParse(shortPassword).success).toBe(false);
  });

  it('should validate LoginDto correctly', () => {
    const valid = {
      login: 'user@strata.chat',
      password: 'MyPassword',
      clientType: 'desktop',
      deviceName: 'MacBook Pro'
    };
    expect(LoginDtoSchema.safeParse(valid).success).toBe(true);
  });
});
