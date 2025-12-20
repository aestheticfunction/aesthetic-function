import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMaterializeMode,
  getMaterializeOn,
  getMaterializeDryRun,
  isMaterializeEnabled,
  getAstWriteMode,
  getAstWriteDryRun,
  getAstWriteAllow,
  isAstWriteEnabled,
  isAstWriteOpAllowed,
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

// =============================================================================
// AST WRITE CONFIG TESTS
// =============================================================================

describe('AST write config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear AST write-related env vars before each test
    delete process.env.AST_WRITE_MODE;
    delete process.env.AST_WRITE_DRY_RUN;
    delete process.env.AST_WRITE_ALLOW;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('getAstWriteMode', () => {
    it('returns "off" by default when AST_WRITE_MODE is not set', () => {
      expect(getAstWriteMode()).toBe('off');
    });

    it('returns "off" when AST_WRITE_MODE is "off"', () => {
      process.env.AST_WRITE_MODE = 'off';
      expect(getAstWriteMode()).toBe('off');
    });

    it('returns "patch" when AST_WRITE_MODE is "patch"', () => {
      process.env.AST_WRITE_MODE = 'patch';
      expect(getAstWriteMode()).toBe('patch');
    });

    it('returns "write" when AST_WRITE_MODE is "write"', () => {
      process.env.AST_WRITE_MODE = 'write';
      expect(getAstWriteMode()).toBe('write');
    });

    it('is case-insensitive', () => {
      process.env.AST_WRITE_MODE = 'WRITE';
      expect(getAstWriteMode()).toBe('write');

      process.env.AST_WRITE_MODE = 'Patch';
      expect(getAstWriteMode()).toBe('patch');
    });

    it('returns "off" for unrecognized values', () => {
      process.env.AST_WRITE_MODE = 'invalid';
      expect(getAstWriteMode()).toBe('off');
    });
  });

  describe('getAstWriteDryRun', () => {
    it('returns true by default when AST_WRITE_DRY_RUN is not set (safe default)', () => {
      expect(getAstWriteDryRun()).toBe(true);
    });

    it('returns true when AST_WRITE_DRY_RUN is "true"', () => {
      process.env.AST_WRITE_DRY_RUN = 'true';
      expect(getAstWriteDryRun()).toBe(true);
    });

    it('returns true when AST_WRITE_DRY_RUN is "1"', () => {
      process.env.AST_WRITE_DRY_RUN = '1';
      expect(getAstWriteDryRun()).toBe(true);
    });

    it('returns false when AST_WRITE_DRY_RUN is "false"', () => {
      process.env.AST_WRITE_DRY_RUN = 'false';
      expect(getAstWriteDryRun()).toBe(false);
    });

    it('returns false when AST_WRITE_DRY_RUN is "0"', () => {
      process.env.AST_WRITE_DRY_RUN = '0';
      expect(getAstWriteDryRun()).toBe(false);
    });

    it('returns true for unrecognized values (safe default)', () => {
      process.env.AST_WRITE_DRY_RUN = 'yes';
      expect(getAstWriteDryRun()).toBe(true);

      process.env.AST_WRITE_DRY_RUN = 'no';
      expect(getAstWriteDryRun()).toBe(true);
    });

    it('is case-insensitive', () => {
      process.env.AST_WRITE_DRY_RUN = 'FALSE';
      expect(getAstWriteDryRun()).toBe(false);

      process.env.AST_WRITE_DRY_RUN = 'True';
      expect(getAstWriteDryRun()).toBe(true);
    });
  });

  describe('getAstWriteAllow', () => {
    it('returns default ops when AST_WRITE_ALLOW is not set', () => {
      const allowed = getAstWriteAllow();
      expect(allowed).toContain('SET_TEXT');
      expect(allowed).toContain('SET_FILL');
      expect(allowed).toContain('SET_LAYOUT');
    });

    it('parses comma-separated operation list', () => {
      process.env.AST_WRITE_ALLOW = 'SET_TEXT,SET_FILL';
      const allowed = getAstWriteAllow();
      expect(allowed).toContain('SET_TEXT');
      expect(allowed).toContain('SET_FILL');
      expect(allowed).not.toContain('SET_LAYOUT');
    });

    it('handles whitespace in comma-separated list', () => {
      process.env.AST_WRITE_ALLOW = 'SET_TEXT , SET_FILL , SET_LAYOUT';
      const allowed = getAstWriteAllow();
      expect(allowed).toHaveLength(3);
    });

    it('is case-insensitive', () => {
      process.env.AST_WRITE_ALLOW = 'set_text,set_fill';
      const allowed = getAstWriteAllow();
      expect(allowed).toContain('SET_TEXT');
      expect(allowed).toContain('SET_FILL');
    });

    it('filters out invalid operation types', () => {
      process.env.AST_WRITE_ALLOW = 'SET_TEXT,INVALID_OP,SET_FILL';
      const allowed = getAstWriteAllow();
      expect(allowed).toContain('SET_TEXT');
      expect(allowed).toContain('SET_FILL');
      expect(allowed).not.toContain('INVALID_OP');
    });

    it('returns defaults if all ops are invalid', () => {
      process.env.AST_WRITE_ALLOW = 'INVALID,ALSO_INVALID';
      const allowed = getAstWriteAllow();
      expect(allowed).toContain('SET_TEXT');
      expect(allowed).toContain('SET_FILL');
      expect(allowed).toContain('SET_LAYOUT');
    });
  });

  describe('isAstWriteEnabled', () => {
    it('returns false when mode is "off" (default)', () => {
      expect(isAstWriteEnabled()).toBe(false);
    });

    it('returns true when mode is "patch"', () => {
      process.env.AST_WRITE_MODE = 'patch';
      expect(isAstWriteEnabled()).toBe(true);
    });

    it('returns true when mode is "write"', () => {
      process.env.AST_WRITE_MODE = 'write';
      expect(isAstWriteEnabled()).toBe(true);
    });
  });

  describe('isAstWriteOpAllowed', () => {
    it('returns true for SET_TEXT when in default allow list', () => {
      expect(isAstWriteOpAllowed('SET_TEXT')).toBe(true);
    });

    it('returns true for SET_FILL when in default allow list', () => {
      expect(isAstWriteOpAllowed('SET_FILL')).toBe(true);
    });

    it('returns true for SET_LAYOUT when in default allow list', () => {
      expect(isAstWriteOpAllowed('SET_LAYOUT')).toBe(true);
    });

    it('respects custom allow list', () => {
      process.env.AST_WRITE_ALLOW = 'SET_TEXT';
      expect(isAstWriteOpAllowed('SET_TEXT')).toBe(true);
      expect(isAstWriteOpAllowed('SET_FILL')).toBe(false);
      expect(isAstWriteOpAllowed('SET_LAYOUT')).toBe(false);
    });
  });

  describe('real write scenario', () => {
    it('should allow writes when AST_WRITE_MODE=write and AST_WRITE_DRY_RUN=false', () => {
      process.env.AST_WRITE_MODE = 'write';
      process.env.AST_WRITE_DRY_RUN = 'false';

      expect(getAstWriteMode()).toBe('write');
      expect(getAstWriteDryRun()).toBe(false);
      expect(isAstWriteEnabled()).toBe(true);
      expect(isAstWriteOpAllowed('SET_TEXT')).toBe(true);
    });

    it('should be dry-run by default even when AST_WRITE_MODE=write', () => {
      process.env.AST_WRITE_MODE = 'write';
      // AST_WRITE_DRY_RUN not set

      expect(getAstWriteMode()).toBe('write');
      expect(getAstWriteDryRun()).toBe(true); // Safe default
      expect(isAstWriteEnabled()).toBe(true);
    });
  });
});
