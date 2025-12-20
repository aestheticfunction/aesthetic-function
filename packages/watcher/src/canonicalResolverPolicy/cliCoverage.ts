#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - canonicalResolverPolicy/cliCoverage.ts
 *
 * CLI tool for project-level canonical resolution coverage reporting.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher canonical:coverage <path>
 *   pnpm --filter @aesthetic-function/watcher canonical:coverage src --json
 *
 * Options:
 *   --json    Output machine-readable JSON to stdout
 *
 * Environment:
 *   CANONICAL_STRICT=true           Enable strict mode (violations fail CI)
 *   CANONICAL_COLOR_STRATEGY=...    Color resolution strategy
 *   CANONICAL_SPACING_SCALE=...     Spacing scale strategy
 *   CANONICAL_RADIUS_SCALE=...      Radius scale strategy
 *   CANONICAL_TYPOGRAPHY_SCALE=...  Typography scale strategy
 *
 * This tool scans TSX files, runs the AST pipeline, resolves canonical
 * semantics, applies policy, and produces aggregate coverage statistics.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntentFromReactAst, runAdaptersOnFile } from '../ast/parseIntentFromReactAst.js';
import { resolveCanonicalSemantics, buildCoverageReport } from '../canonicalResolver/index.js';
import {
  getResolutionPolicyFromEnv,
  applyPolicyToResolution,
  formatPolicy,
} from './policy.js';
import type {
  ResolutionPolicy,
  PolicyViolation,
  FileCoverage,
  GapSummary,
  ProjectCoverageReport,
} from './types.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  // This file is at packages/watcher/src/canonicalResolverPolicy/cliCoverage.ts
  // Repo root is 5 directories up
  return resolve(__dirname, '..', '..', '..', '..', '..');
}

// =============================================================================
// FILE SCANNING
// =============================================================================

/**
 * Recursively scan a directory for TSX files.
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative paths
 * @returns Array of absolute file paths
 */
async function scanTsxFiles(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);

      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await scanTsxFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === '.tsx') {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Silently skip directories we can't read
  }

  return files;
}

/**
 * Resolve the input path to an absolute path and determine if it's a file or directory.
 */
async function resolveInputPath(
  inputPath: string,
  repoRoot: string,
): Promise<{ absolutePath: string; isDirectory: boolean }> {
  // Try relative to repo root first
  let absolutePath = resolve(repoRoot, inputPath);

  try {
    const stats = await stat(absolutePath);
    return { absolutePath, isDirectory: stats.isDirectory() };
  } catch {
    // Try as absolute path
    absolutePath = resolve(inputPath);
    try {
      const stats = await stat(absolutePath);
      return { absolutePath, isDirectory: stats.isDirectory() };
    } catch {
      throw new Error(`Path not found: ${inputPath}`);
    }
  }
}

// =============================================================================
// FILE ANALYSIS
// =============================================================================

/**
 * Analyze a single file and return coverage data.
 */
async function analyzeFile(
  absolutePath: string,
  relativePath: string,
  policy: ResolutionPolicy,
): Promise<FileCoverage | null> {
  try {
    const code = await readFile(absolutePath, 'utf-8');

    // Run AST pipeline
    const astReport = parseIntentFromReactAst(code, relativePath);

    // Run adapters
    const adapterResult = runAdaptersOnFile(code, relativePath, astReport);

    // Accumulate coverage data
    let canonicalFields = 0;
    let resolved = 0;
    let unresolved = 0;
    const violations: PolicyViolation[] = [];

    for (const comp of adapterResult.components) {
      if (!comp.canonicalSemantics) {
        continue;
      }

      // Resolve canonical semantics
      const resolution = resolveCanonicalSemantics(comp.canonicalSemantics);
      const coverageReport = buildCoverageReport(resolution);

      canonicalFields += coverageReport.totals.canonicalFields;
      resolved += coverageReport.totals.resolved;
      unresolved += coverageReport.totals.unresolved;

      // Apply policy
      const policyResult = applyPolicyToResolution(resolution, policy, {
        file: relativePath,
        componentKey: comp.componentName,
      });

      violations.push(...policyResult.violations);
    }

    return {
      file: relativePath,
      componentCount: adapterResult.components.length,
      canonicalFields,
      resolved,
      unresolved,
      violations,
    };
  } catch (err) {
    // Skip files that can't be parsed
    console.error(`Warning: Could not analyze ${relativePath}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// =============================================================================
// PROJECT COVERAGE
// =============================================================================

/**
 * Build project-level coverage report from file-level data.
 */
function buildProjectCoverage(
  fileCoverages: FileCoverage[],
  policy: ResolutionPolicy,
): ProjectCoverageReport {
  // Aggregate totals
  let totalComponents = 0;
  let totalCanonicalFields = 0;
  let totalResolved = 0;
  let totalUnresolved = 0;
  const allViolations: PolicyViolation[] = [];

  // Per-category tracking
  const byCategory: Record<'colors' | 'spacing' | 'radius' | 'typography', {
    canonicalFields: number;
    resolved: number;
    unresolved: number;
  }> = {
    colors: { canonicalFields: 0, resolved: 0, unresolved: 0 },
    spacing: { canonicalFields: 0, resolved: 0, unresolved: 0 },
    radius: { canonicalFields: 0, resolved: 0, unresolved: 0 },
    typography: { canonicalFields: 0, resolved: 0, unresolved: 0 },
  };

  // Gap tracking
  const gapMap = new Map<string, { category: 'colors' | 'spacing' | 'radius' | 'typography'; files: Set<string> }>();

  for (const file of fileCoverages) {
    totalComponents += file.componentCount;
    totalCanonicalFields += file.canonicalFields;
    totalResolved += file.resolved;
    totalUnresolved += file.unresolved;
    allViolations.push(...file.violations);

    // Track gaps from violations for category-level tracking
    for (const v of file.violations) {
      const key = v.canonical;
      if (!gapMap.has(key)) {
        gapMap.set(key, { category: v.category, files: new Set() });
      }
      const entry = gapMap.get(key)!;
      if (v.file) {
        entry.files.add(v.file);
      }
    }
  }

  // Build top gaps
  const topGaps: GapSummary[] = Array.from(gapMap.entries())
    .map(([canonical, data]) => ({
      canonical,
      category: data.category,
      count: data.files.size,
      files: Array.from(data.files),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Build lowest coverage files
  const lowestCoverageFiles = fileCoverages
    .filter((f) => f.canonicalFields > 0)
    .map((f) => ({
      file: f.file,
      coveragePercent: Math.round((f.resolved / f.canonicalFields) * 100),
      resolved: f.resolved,
      total: f.canonicalFields,
    }))
    .sort((a, b) => a.coveragePercent - b.coveragePercent)
    .slice(0, 10);

  // Calculate coverage percentage
  const coveragePercent = totalCanonicalFields > 0
    ? Math.round((totalResolved / totalCanonicalFields) * 100)
    : 100;

  return {
    filesScanned: fileCoverages.length,
    totalComponents,
    totalCanonicalFields,
    totalResolved,
    totalUnresolved,
    coveragePercent,
    byCategory,
    topGaps,
    lowestCoverageFiles,
    violations: allViolations,
    policy,
    wouldFailCI: policy.strict && allViolations.length > 0,
  };
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

/**
 * Print project coverage report to console.
 */
function printCoverageReport(report: ProjectCoverageReport): void {
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│           PROJECT CANONICAL COVERAGE (Phase 10G)                │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  // Totals
  console.log(`│ Files scanned:    ${String(report.filesScanned).padEnd(45)}│`);
  console.log(`│ Components:       ${String(report.totalComponents).padEnd(45)}│`);
  console.log(`│ Canonical fields: ${String(report.totalCanonicalFields).padEnd(45)}│`);
  console.log(`│ Resolved:         ${String(report.totalResolved).padEnd(45)}│`);
  console.log(`│ Unresolved:       ${String(report.totalUnresolved).padEnd(45)}│`);
  console.log(`│ Coverage:         ${(report.coveragePercent + '%').padEnd(45)}│`);
  console.log('├─────────────────────────────────────────────────────────────────┤');

  // Policy
  console.log(`│ Policy:           ${formatPolicy(report.policy).padEnd(45)}│`);
  console.log('├─────────────────────────────────────────────────────────────────┤');

  // Top gaps
  if (report.topGaps.length > 0) {
    console.log('│ Top Gaps:'.padEnd(66) + '│');
    for (const gap of report.topGaps.slice(0, 5)) {
      const line = `  ${gap.canonical} (${gap.category}): ${gap.count} file(s)`;
      console.log(`│${line.padEnd(65)}│`);
    }
    console.log('├─────────────────────────────────────────────────────────────────┤');
  }

  // Lowest coverage files
  if (report.lowestCoverageFiles.length > 0) {
    console.log('│ Lowest Coverage Files:'.padEnd(66) + '│');
    for (const file of report.lowestCoverageFiles.slice(0, 5)) {
      const line = `  ${file.file}: ${file.coveragePercent}% (${file.resolved}/${file.total})`;
      const truncated = line.length > 63 ? line.slice(0, 60) + '...' : line;
      console.log(`│${truncated.padEnd(65)}│`);
    }
    console.log('├─────────────────────────────────────────────────────────────────┤');
  }

  // Violations
  if (report.violations.length > 0) {
    console.log('│ Policy Violations:'.padEnd(66) + '│');
    for (const v of report.violations.slice(0, 10)) {
      const line = `  [${v.category}] ${v.canonical}`;
      console.log(`│${line.padEnd(65)}│`);
      const reason = `    → ${v.reason}`;
      const truncatedReason = reason.length > 63 ? reason.slice(0, 60) + '...' : reason;
      console.log(`│${truncatedReason.padEnd(65)}│`);
    }
    if (report.violations.length > 10) {
      console.log(`│  ... and ${report.violations.length - 10} more violations`.padEnd(66) + '│');
    }
    console.log('├─────────────────────────────────────────────────────────────────┤');
  }

  // CI status
  if (report.wouldFailCI) {
    console.log('│ ⛔ WOULD FAIL CI: strict mode enabled with violations'.padEnd(66) + '│');
  } else if (report.policy.strict) {
    console.log('│ ✅ CI PASS: strict mode enabled, no violations'.padEnd(66) + '│');
  } else {
    console.log('│ ℹ️  CI: strict mode disabled (violations are informational)'.padEnd(66) + '│');
  }

  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log('');
}

// =============================================================================
// MAIN CLI
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse args
  const jsonOutput = args.includes('--json');
  const pathArgs = args.filter((a) => !a.startsWith('--'));

  if (pathArgs.length === 0) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher canonical:coverage <path> [--json]');
    console.error('Example: pnpm --filter @aesthetic-function/watcher canonical:coverage src');
    console.error('Example: pnpm --filter @aesthetic-function/watcher canonical:coverage demo-app/src --json');
    process.exit(1);
  }

  const inputPath = pathArgs[0];
  const repoRoot = getRepoRoot();

  // Get policy from environment
  const policy = getResolutionPolicyFromEnv();

  // Resolve input path
  let absolutePath: string;
  let isDirectory: boolean;
  try {
    const result = await resolveInputPath(inputPath, repoRoot);
    absolutePath = result.absolutePath;
    isDirectory = result.isDirectory;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Collect files
  let files: string[];
  if (isDirectory) {
    files = await scanTsxFiles(absolutePath, repoRoot);
  } else {
    files = [absolutePath];
  }

  if (files.length === 0) {
    console.error('No .tsx files found in the specified path');
    process.exit(1);
  }

  if (!jsonOutput) {
    console.log(`Scanning ${files.length} file(s)...`);
  }

  // Analyze each file
  const fileCoverages: FileCoverage[] = [];
  for (const file of files) {
    const relativePath = relative(repoRoot, file);
    const coverage = await analyzeFile(file, relativePath, policy);
    if (coverage) {
      fileCoverages.push(coverage);
    }
  }

  // Build project coverage
  const projectCoverage = buildProjectCoverage(fileCoverages, policy);

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(projectCoverage, null, 2));
  } else {
    printCoverageReport(projectCoverage);
  }

  // Exit with error if strict mode and violations
  if (projectCoverage.wouldFailCI) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
