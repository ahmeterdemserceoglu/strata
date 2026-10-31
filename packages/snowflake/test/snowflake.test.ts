import { describe, it, expect } from 'vitest';
import {
  SnowflakeGenerator,
  extractTimestamp,
  extractWorkerId,
  extractSequence,
  deconstruct,
  generateBoundary,
  STRATA_EPOCH
} from '../src/index.js';

describe('SnowflakeGenerator', () => {
  it('should generate valid 64-bit string snowflake IDs', () => {
    const generator = new SnowflakeGenerator(42);
    const id = generator.generate();

    expect(typeof id).toBe('string');
    expect(BigInt(id)).toBeGreaterThan(0n);
  });

  it('should correctly encode and decode worker ID', () => {
    const workerId = 777;
    const generator = new SnowflakeGenerator(workerId);
    const id = generator.generate();

    expect(extractWorkerId(id)).toBe(workerId);
  });

  it('should reject worker IDs out of 0..1023 range', () => {
    expect(() => new SnowflakeGenerator(-1)).toThrow();
    expect(() => new SnowflakeGenerator(1024)).toThrow();
  });

  it('should generate strictly monotonic increasing IDs', () => {
    const generator = new SnowflakeGenerator(1);
    const count = 1000;
    const ids = generator.generateBatch(count);

    expect(ids.length).toBe(count);
    for (let i = 1; i < ids.length; i++) {
      expect(BigInt(ids[i]!)).toBeGreaterThan(BigInt(ids[i - 1]!));
    }
  });

  it('should extract correct timestamp close to current time', () => {
    const generator = new SnowflakeGenerator(5);
    const before = Date.now();
    const id = generator.generate();
    const after = Date.now();

    const extracted = extractTimestamp(id);
    expect(extracted).toBeGreaterThanOrEqual(before);
    expect(extracted).toBeLessThanOrEqual(after);
  });

  it('should deconstruct Snowflake completely', () => {
    const generator = new SnowflakeGenerator(12);
    const id = generator.generate();
    const components = deconstruct(id);

    expect(components.workerId).toBe(12);
    expect(components.sequence).toBeGreaterThanOrEqual(0);
    expect(components.timestamp).toBeGreaterThan(Number(STRATA_EPOCH));
    expect(components.date).toBeInstanceOf(Date);
  });

  it('should generate boundary ID for pagination queries', () => {
    const now = new Date('2025-06-01T12:00:00.000Z');
    const lowerBoundary = generateBoundary(now, false);
    const upperBoundary = generateBoundary(now, true);

    expect(BigInt(upperBoundary)).toBeGreaterThan(BigInt(lowerBoundary));
    expect(extractTimestamp(lowerBoundary)).toBe(now.getTime());
    expect(extractTimestamp(upperBoundary)).toBe(now.getTime());
    expect(extractSequence(lowerBoundary)).toBe(0);
    expect(extractWorkerId(lowerBoundary)).toBe(0);
  });
});
