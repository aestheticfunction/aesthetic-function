import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getUseOverrides,
  getOverridesPrecedence,
  isOverrideNewerThanFile,
} from '../config.js';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear override-related env vars before each test
    delete process.env.USE_OVERRIDES;
    delete process.env.OVERRIDES_PRECEDENCE;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('getUseOverrides', () => {
    it('returns true by default when USE_OVERRIDES is not set', () => {
      expect(getUseOverrides()).toBe(true);
    });

    it('returns true when USE_OVERRIDES is "true"', () => {
      process.env.USE_OVERRIDES = 'true';
      expect(getUseOverrides()).toBe(true);
    });

    it('returns true when USE_OVERRIDES is "1"', () => {
      process.env.USE_OVERRIDES = '1';
      expect(getUseOverrides()).toBe(true);
    });

    it('returns false when USE_OVERRIDES is "false"', () => {
      process.env.USE_OVERRIDES = 'false';
      expect(getUseOverrides()).toBe(false);
    });

    it('returns false when USE_OVERRIDES is "0"', () => {
      process.env.USE_OVERRIDES = '0';
      expect(getUseOverrides()).toBe(false);
    });

    it('returns true for unrecognized values (defaults to true)', () => {
      process.env.USE_OVERRIDES = 'yes';
      expect(getUseOverrides()).toBe(true);
    });
  });

  describe('getOverridesPrecedence', () => {
    it('returns "always" by default when OVERRIDES_PRECEDENCE is not set', () => {
      expect(getOverridesPrecedence()).toBe('always');
    });

    it('returns "always" when OVERRIDES_PRECEDENCE is "always"', () => {
      process.env.OVERRIDES_PRECEDENCE = 'always';
      expect(getOverridesPrecedence()).toBe('always');
    });

    it('returns "if_newer_than_code" when OVERRIDES_PRECEDENCE is "if_newer_than_code"', () => {
      process.env.OVERRIDES_PRECEDENCE = 'if_newer_than_code';
      expect(getOverridesPrecedence()).toBe('if_newer_than_code');
    });

    it('returns "always" for unrecognized values', () => {
      process.env.OVERRIDES_PRECEDENCE = 'invalid';
      expect(getOverridesPrecedence()).toBe('always');
    });

    it('is case-insensitive for precedence values', () => {
      process.env.OVERRIDES_PRECEDENCE = 'IF_NEWER_THAN_CODE';
      expect(getOverridesPrecedence()).toBe('if_newer_than_code');
    });
  });

  describe('isOverrideNewerThanFile', () => {
    const fileTime = new Date('2024-01-15T12:00:00.000Z');

    it('returns true when lastUpdated is after file mtime', () => {
      const newerTimestamp = '2024-01-15T13:00:00.000Z'; // 1 hour after
      expect(isOverrideNewerThanFile(newerTimestamp, fileTime)).toBe(true);
    });

    it('returns false when lastUpdated is before file mtime', () => {
      const olderTimestamp = '2024-01-15T11:00:00.000Z'; // 1 hour before
      expect(isOverrideNewerThanFile(olderTimestamp, fileTime)).toBe(false);
    });

    it('returns false when lastUpdated is exactly equal to file mtime', () => {
      const equalTimestamp = '2024-01-15T12:00:00.000Z';
      expect(isOverrideNewerThanFile(equalTimestamp, fileTime)).toBe(false);
    });

    it('returns false when lastUpdated is undefined', () => {
      expect(isOverrideNewerThanFile(undefined, fileTime)).toBe(false);
    });

    it('returns false when lastUpdated is an invalid date string', () => {
      expect(isOverrideNewerThanFile('not-a-date', fileTime)).toBe(false);
    });

    it('returns false when lastUpdated is an empty string', () => {
      expect(isOverrideNewerThanFile('', fileTime)).toBe(false);
    });

    it('handles various ISO date formats', () => {
      // With milliseconds
      expect(isOverrideNewerThanFile('2024-01-15T13:00:00.500Z', fileTime)).toBe(true);
      
      // Without Z suffix (treated as local time, but should still parse)
      const localTimestamp = '2024-01-15T13:00:00';
      const result = isOverrideNewerThanFile(localTimestamp, fileTime);
      // Result depends on timezone, but should not throw
      expect(typeof result).toBe('boolean');
    });

    it('handles dates near the boundary', () => {
      // 1 millisecond after
      expect(isOverrideNewerThanFile('2024-01-15T12:00:00.001Z', fileTime)).toBe(true);
      
      // 1 millisecond before
      const slightlyBefore = new Date(fileTime.getTime() - 1).toISOString();
      expect(isOverrideNewerThanFile(slightlyBefore, fileTime)).toBe(false);
    });
  });
});
