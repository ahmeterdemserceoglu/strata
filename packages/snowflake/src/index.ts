/**
 * 64-bit Snowflake ID Generator
 *
 * Structure:
 * - 42 bits: Milliseconds since custom epoch (2025-01-01T00:00:00.000Z) (~139 years)
 * - 10 bits: Worker ID (0..1023)
 * - 12 bits: Sequence (0..4095 per millisecond per worker)
 */

export const STRATA_EPOCH = 1735689600000n; // 2025-01-01T00:00:00.000Z in ms
const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;

const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n; // 1023
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;   // 4095

const TIMESTAMP_SHIFT = WORKER_ID_BITS + SEQUENCE_BITS; // 22 bits
const WORKER_ID_SHIFT = SEQUENCE_BITS;                  // 12 bits

export interface SnowflakeComponents {
  timestamp: number;
  workerId: number;
  sequence: number;
  date: Date;
}

export class SnowflakeGenerator {
  private readonly workerId: bigint;
  private sequence: bigint = 0n;
  private lastTimestamp: bigint = -1n;

  constructor(workerId: number = 0) {
    const wId = BigInt(workerId);
    if (wId < 0n || wId > MAX_WORKER_ID) {
      throw new Error(`Worker ID [${workerId}] 0 ile ${MAX_WORKER_ID} arasında olmalıdır.`);
    }
    this.workerId = wId;
  }

  public getWorkerId(): number {
    return Number(this.workerId);
  }

  /**
   * Generates a 64-bit Snowflake ID and returns it as a string.
   */
  public generate(): string {
    let now = BigInt(Date.now());

    // Clock moved backward protection
    if (now < this.lastTimestamp) {
      const offset = this.lastTimestamp - now;
      if (offset <= 5n) {
        // Tolerable clock drift: spin wait
        while (now <= this.lastTimestamp) {
          now = BigInt(Date.now());
        }
      } else {
        throw new Error(
          `Sistem saati geri kaydı (${offset}ms). Güvenlik sebebiyle Snowflake üretimi durduruldu.`
        );
      }
    }

    if (now === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // Exhausted sequence within the same millisecond; wait for next ms
        while (now <= this.lastTimestamp) {
          now = BigInt(Date.now());
        }
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = now;

    const timePart = (now - STRATA_EPOCH) << TIMESTAMP_SHIFT;
    const workerPart = this.workerId << WORKER_ID_SHIFT;
    const snowflake = timePart | workerPart | this.sequence;

    return snowflake.toString();
  }

  /**
   * Generates multiple Snowflake IDs guaranteed to be strictly ascending.
   */
  public generateBatch(count: number): string[] {
    const result: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = this.generate();
    }
    return result;
  }
}

/**
 * Extracts the timestamp (in ms since Unix epoch) from a Snowflake ID string.
 */
export function extractTimestamp(snowflake: string): number {
  const id = BigInt(snowflake);
  const timeOffset = id >> TIMESTAMP_SHIFT;
  return Number(timeOffset + STRATA_EPOCH);
}

/**
 * Extracts the Date object from a Snowflake ID string.
 */
export function extractDate(snowflake: string): Date {
  return new Date(extractTimestamp(snowflake));
}

/**
 * Extracts the 10-bit Worker ID from a Snowflake ID string.
 */
export function extractWorkerId(snowflake: string): number {
  const id = BigInt(snowflake);
  const worker = (id >> WORKER_ID_SHIFT) & MAX_WORKER_ID;
  return Number(worker);
}

/**
 * Extracts the 12-bit sequence from a Snowflake ID string.
 */
export function extractSequence(snowflake: string): number {
  const id = BigInt(snowflake);
  return Number(id & MAX_SEQUENCE);
}

/**
 * Deconstructs a Snowflake ID into its constituent parts.
 */
export function deconstruct(snowflake: string): SnowflakeComponents {
  const ts = extractTimestamp(snowflake);
  return {
    timestamp: ts,
    date: new Date(ts),
    workerId: extractWorkerId(snowflake),
    sequence: extractSequence(snowflake)
  };
}

/**
 * Generates a boundary Snowflake ID for a given Date or timestamp (useful for SQL/pagination queries like `id < boundary`).
 */
export function generateBoundary(dateOrTimestamp: Date | number, roundUp: boolean = false): string {
  const ms = typeof dateOrTimestamp === 'number' ? BigInt(dateOrTimestamp) : BigInt(dateOrTimestamp.getTime());
  const timeOffset = (ms - STRATA_EPOCH) << TIMESTAMP_SHIFT;
  const seqAndWorker = roundUp ? (MAX_WORKER_ID << WORKER_ID_SHIFT) | MAX_SEQUENCE : 0n;
  return (timeOffset | seqAndWorker).toString();
}

// Global default generator for worker 0
export const defaultSnowflake = new SnowflakeGenerator(0);
export const generateId = () => defaultSnowflake.generate();
