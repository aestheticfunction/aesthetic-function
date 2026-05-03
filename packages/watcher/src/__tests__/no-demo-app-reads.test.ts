/**
 * @aesthetic-function/watcher - __tests__/no-demo-app-reads.test.ts
 *
 * CI GUARDRAIL: Ensures test files never read from demo-app/ or vue-demo-app/.
 *
 * This test scans all test files in the watcher package and fails if any:
 * - Use readFileSync/readFile to read from demo-app/ or vue-demo-app/
 * - Import from demo-app/ or vue-demo-app/
 *
 * ALLOWED:
 * - Using 'demo-app' or 'vue-demo-app' as a path string in test data
 *   (e.g., 'demo-app/src/App.tsx', 'vue-demo-app/src/App.vue')
 * - Reading from __fixtures__/ directories
 *
 * See CONTRIBUTING.md for the full test stability policy.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively find all test files in a directory.
 */
function findTestFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      // Skip node_modules and __snapshots__
      if (entry === 'node_modules' || entry === '__snapshots__') {
        continue;
      }

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...findTestFiles(fullPath));
      } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results;
}

/**
 * Check if a test file has dangerous demo-app or vue-demo-app reads.
 *
 * Returns an array of violation descriptions.
 */
function checkForDemoAppReads(filePath: string): string[] {
  const violations: string[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Both demo app directories are off-limits for direct file reads.
  const BLOCKED_DIRS = ['demo-app', 'vue-demo-app'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    for (const dir of BLOCKED_DIRS) {
      // Pattern 1: readFileSync/readFile with blocked dir path
      if (
        (line.includes('readFileSync') || line.includes('readFile(')) &&
        line.includes(dir)
      ) {
        violations.push(`Line ${lineNum}: Possible readFile from ${dir}/: ${trimmed}`);
      }

      // Pattern 2: Import from blocked dir
      if (line.includes('import') && line.includes(dir)) {
        violations.push(`Line ${lineNum}: Import from ${dir}/: ${trimmed}`);
      }

      // Pattern 3: Dynamic import of blocked dir
      if (line.includes('import(') && line.includes(dir)) {
        violations.push(`Line ${lineNum}: Dynamic import from ${dir}/: ${trimmed}`);
      }
    }
  }

  return violations;
}

describe('CI Guardrail: No Demo-App Reads in Tests', () => {
  it('should not have any test files that read from demo-app/ or vue-demo-app/', () => {
    // Find the watcher src directory
    const srcDir = join(__dirname, '..');
    const testFiles = findTestFiles(srcDir);

    // Exclude this test file itself
    const thisFile = __filename;
    const filesToCheck = testFiles.filter((f) => f !== thisFile);

    const allViolations: { file: string; violations: string[] }[] = [];

    for (const testFile of filesToCheck) {
      const violations = checkForDemoAppReads(testFile);
      if (violations.length > 0) {
        // Get relative path for cleaner output
        const relativePath = testFile.replace(srcDir, 'src');
        allViolations.push({ file: relativePath, violations });
      }
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map(({ file, violations }) => {
          return `\n${file}:\n  ${violations.join('\n  ')}`;
        })
        .join('\n');

      expect.fail(
        `Found test files that read from demo-app/ or vue-demo-app/.\n` +
          `This breaks test stability - use fixtures instead.\n` +
          `See CONTRIBUTING.md for the test stability policy.\n` +
          `\nViolations:${report}`
      );
    }

    // If we get here, no violations found
    expect(allViolations).toHaveLength(0);
  });

  it('should have at least one fixture file', () => {
    const fixturesDir = join(__dirname, '..', '__fixtures__');

    let hasFixtures = false;
    try {
      const entries = readdirSync(fixturesDir);
      hasFixtures = entries.some((e) => e.includes('.fixture.'));
    } catch {
      // Directory doesn't exist
    }

    expect(hasFixtures).toBe(true);
  });

  it('should use fixtures/App.fixture.tsx path for stable snapshots', () => {
    // Check that the parseIntentFromReactAst test uses the normalized fixture path
    const astTestPath = join(
      __dirname,
      '..',
      'ast',
      '__tests__',
      'parseIntentFromReactAst.test.ts'
    );

    const content = readFileSync(astTestPath, 'utf-8');

    // Should have the FIXTURE_PATH constant
    expect(content).toContain("const FIXTURE_PATH = 'fixtures/App.fixture.tsx'");

    // Should have the readAppFixture helper
    expect(content).toContain('function readAppFixture()');

    // Should NOT have readDemoApp function
    expect(content).not.toContain('function readDemoApp()');
  });
});
