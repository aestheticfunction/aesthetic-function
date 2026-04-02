/**
 * @aesthetic-function/cli - __tests__/init.test.ts
 *
 * Phase 15C: Tests for `af init` command.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { init } from '../commands/init.js';

// =============================================================================
// HELPERS
// =============================================================================

function createTestDir(): string {
  const testDir = join(
    tmpdir(),
    `af-cli-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDir(testDir: string): void {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('af init', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    testDir = createTestDir();
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTestDir(testDir);
  });

  it('shows help with --help', async () => {
    const code = await init(['--help']);
    expect(code).toBe(0);
  });

  it('creates af.config.json with default profile in non-TTY mode', async () => {
    const code = await init(['--profile', 'designer-first']);
    expect(code).toBe(0);

    const configPath = join(testDir, 'af.config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.profile).toBe('designer-first');
    expect(config.server).toBeDefined();
  });

  it('creates af.config.json with code-first profile', async () => {
    const code = await init(['--profile', 'code-first']);
    expect(code).toBe(0);

    const config = JSON.parse(readFileSync(join(testDir, 'af.config.json'), 'utf-8'));
    expect(config.profile).toBe('code-first');
  });

  it('rejects invalid profile name', async () => {
    const code = await init(['--profile', 'invalid-profile']);
    expect(code).toBe(2);
    expect(existsSync(join(testDir, 'af.config.json'))).toBe(false);
  });

  it('refuses to overwrite existing config without --force', async () => {
    writeFileSync(join(testDir, 'af.config.json'), '{}');
    const code = await init(['--profile', 'designer-first']);
    expect(code).toBe(1);
  });

  it('overwrites existing config with --force', async () => {
    writeFileSync(join(testDir, 'af.config.json'), '{"old": true}');
    const code = await init(['--force', '--profile', 'balanced']);
    expect(code).toBe(0);

    const config = JSON.parse(readFileSync(join(testDir, 'af.config.json'), 'utf-8'));
    expect(config.profile).toBe('balanced');
    expect(config.old).toBeUndefined();
  });

  it('outputs JSON with --json flag without writing file', async () => {
    const code = await init(['--json', '--profile', 'strict-review']);
    expect(code).toBe(0);
    expect(existsSync(join(testDir, 'af.config.json'))).toBe(false);
  });
});
