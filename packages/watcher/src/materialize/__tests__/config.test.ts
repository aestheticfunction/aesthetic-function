import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMaterializeMode,
  getMaterializeOn,
  getMaterializeDryRun,
  isMaterializeEnabled,
} from '../config.js';

describe('materialize config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear materialize-related env vars before each test
    delete process.env.MATERIALIZE_MODE;
    delete process.env.MATERIALIZE_ON;
    delete process.env.MATERIALIZE_DRY_RUN;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('getMaterializeMode', () => {
    it('returns "off" by default when MATERIALIZE_MODE is not set', () => {
      expect(getMaterializeMode()).toBe('off');
    });

    it('returns "off" when MATERIALIZE_MODE is "off"', () => {
      process.env.MATERIALIZE_MODE = 'off';
      expect(getMaterializeMode()).toBe('off');
    });

    it('returns "patch" when MATERIALIZE_MODE is "patch"', () => {
      process.env.MATERIALIZE_MODE = 'patch';
      expect(getMaterializeMode()).toBe('patch');
    });

    it('returns "markers" when MATERIALIZE_MODE is "markers"', () => {
      process.env.MATERIALIZE_MODE = 'markers';
      expect(getMaterializeMode()).toBe('markers');
    });

    it('is case-insensitive', () => {
      process.env.MATERIALIZE_MODE = 'PATCH';
      expect(getMaterializeMode()).toBe('patch');

      process.env.MATERIALIZE_MODE = 'Markers';
      expect(getMaterializeMode()).toBe('markers');
    });

    it('returns "off" for unrecognized values', () => {
      process.env.MATERIALIZE_MODE = 'invalid';
      expect(getMaterializeMode()).toBe('off');
    });
  });

  describe('getMaterializeOn', () => {
    it('returns "design_change" by default when MATERIALIZE_ON is not set', () => {
      expect(getMaterializeOn()).toBe('design_change');
    });

    it('returns "design_change" when MATERIALIZE_ON is "design_change"', () => {
      process.env.MATERIALIZE_ON = 'design_change';
      expect(getMaterializeOn()).toBe('design_change');
    });

    it('returns "file_save" when MATERIALIZE_ON is "file_save"', () => {
      process.env.MATERIALIZE_ON = 'file_save';
      expect(getMaterializeOn()).toBe('file_save');
    });

    it('is case-insensitive', () => {
      process.env.MATERIALIZE_ON = 'FILE_SAVE';
      expect(getMaterializeOn()).toBe('file_save');
    });

    it('returns "design_change" for unrecognized values', () => {
      process.env.MATERIALIZE_ON = 'invalid';
      expect(getMaterializeOn()).toBe('design_change');
    });
  });

  describe('getMaterializeDryRun', () => {
    it('returns true by default when MATERIALIZE_DRY_RUN is not set', () => {
      expect(getMaterializeDryRun()).toBe(true);
    });

    it('returns true when MATERIALIZE_DRY_RUN is "true"', () => {
      process.env.MATERIALIZE_DRY_RUN = 'true';
      expect(getMaterializeDryRun()).toBe(true);
    });

    it('returns true when MATERIALIZE_DRY_RUN is "1"', () => {
      process.env.MATERIALIZE_DRY_RUN = '1';
      expect(getMaterializeDryRun()).toBe(true);
    });

    it('returns false when MATERIALIZE_DRY_RUN is "false"', () => {
      process.env.MATERIALIZE_DRY_RUN = 'false';
      expect(getMaterializeDryRun()).toBe(false);
    });

    it('returns false when MATERIALIZE_DRY_RUN is "0"', () => {
      process.env.MATERIALIZE_DRY_RUN = '0';
      expect(getMaterializeDryRun()).toBe(false);
    });

    it('returns true for unrecognized values (safe default)', () => {
      process.env.MATERIALIZE_DRY_RUN = 'yes';
      expect(getMaterializeDryRun()).toBe(true);
    });
  });

  describe('isMaterializeEnabled', () => {
    it('returns false when mode is "off" (default)', () => {
      expect(isMaterializeEnabled()).toBe(false);
    });

    it('returns true when mode is "patch"', () => {
      process.env.MATERIALIZE_MODE = 'patch';
      expect(isMaterializeEnabled()).toBe(true);
    });

    it('returns true when mode is "markers"', () => {
      process.env.MATERIALIZE_MODE = 'markers';
      expect(isMaterializeEnabled()).toBe(true);
    });
  });
});
