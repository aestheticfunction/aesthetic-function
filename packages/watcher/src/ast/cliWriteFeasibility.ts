#!/usr/bin/env node
/**
 * @aesthetic-function/watcher - ast/cliWriteFeasibility.ts
 *
 * CLI tool for analyzing write feasibility of React JSX components.
 *
 * Usage:
 *   pnpm --filter @aesthetic-function/watcher ast:write-feasibility <file>
 *
 * This tool:
 * 1. Reads the specified file
 * 2. Parses @figma markers and anchors to components
 * 3. Analyzes each semantic value for write safety
 * 4. Prints a detailed report showing what can/cannot be auto-written
 *
 * Output sections:
 * - Per-node breakdown of auto-writable, conditionally-writable, not-writable
 * - Reasons for each classification
 * - Summary statistics
 *
 * SCOPE: This is READ-ONLY analysis. No files are modified.
 */

import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWriteFeasibility } from './analyzeFeasibility.js';
import type { WriteFeasibilityReport, WriteSafetyReport, ValueWriteSafety } from './types.js';

// =============================================================================
// PATH RESOLUTION
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the repo root (where pnpm-workspace.yaml lives).
 */
function getRepoRoot(): string {
  // This file is at packages/watcher/src/ast/cliWriteFeasibility.ts
  // Repo root is 4 directories up
  return resolve(__dirname, '..', '..', '..', '..');
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function printHeader(title: string): void {
  console.log();
  console.log(colors.bold + '='.repeat(70) + colors.reset);
  console.log(colors.bold + title + colors.reset);
  console.log(colors.bold + '='.repeat(70) + colors.reset);
}

function printValue(value: ValueWriteSafety, indent: string = '    '): void {
  const valueStr = value.value !== undefined ? ` = ${JSON.stringify(value.value)}` : '';
  const locStr = value.loc ? ` (L${value.loc.startLine})` : '';
  console.log(`${indent}${colors.dim}${value.path}${valueStr}${locStr}${colors.reset}`);
  console.log(`${indent}  → ${value.explanation}`);
}

function printNodeReport(report: WriteSafetyReport): void {
  const locationStr = report.componentLoc
    ? ` (L${report.componentLoc.startLine}-${report.componentLoc.endLine})`
    : '';
  const componentStr = report.componentName
    ? ` → ${report.componentName}${locationStr}`
    : ' (no component found)';

  console.log();
  console.log(`${colors.bold}[${report.nodeName}]${colors.reset}${componentStr}`);

  // Summary line
  const { autoWritableCount, conditionallyWritableCount, notWritableCount } = report.summary;
  console.log(
    `  Summary: ` +
      `${colors.green}${autoWritableCount} auto-writable${colors.reset}, ` +
      `${colors.yellow}${conditionallyWritableCount} conditional${colors.reset}, ` +
      `${colors.red}${notWritableCount} not-writable${colors.reset}`
  );

  // Auto-writable values
  if (report.autoWritable.length > 0) {
    console.log();
    console.log(`  ${colors.green}✓ AUTO-WRITABLE (can be safely modified):${colors.reset}`);
    for (const v of report.autoWritable) {
      printValue(v);
    }
  }

  // Conditionally writable values
  if (report.conditionallyWritable.length > 0) {
    console.log();
    console.log(`  ${colors.yellow}~ CONDITIONALLY WRITABLE (may require review):${colors.reset}`);
    for (const v of report.conditionallyWritable) {
      printValue(v);
    }
  }

  // Not writable values
  if (report.notWritable.length > 0) {
    console.log();
    console.log(`  ${colors.red}✗ NOT WRITABLE (would never auto-modify):${colors.reset}`);
    for (const v of report.notWritable) {
      printValue(v);
    }
  }
}

function printFileSummary(report: WriteFeasibilityReport): void {
  printHeader('SUMMARY');

  const { totalNodes, totalValues, autoWritableCount, conditionallyWritableCount, notWritableCount } =
    report.summary;

  console.log(`  File: ${report.filePath}`);
  console.log(`  Total anchored nodes: ${totalNodes}`);
  console.log(`  Total semantic values analyzed: ${totalValues}`);
  console.log();

  // Percentage breakdown
  const autoPercent = totalValues > 0 ? ((autoWritableCount / totalValues) * 100).toFixed(1) : '0.0';
  const condPercent =
    totalValues > 0 ? ((conditionallyWritableCount / totalValues) * 100).toFixed(1) : '0.0';
  const notPercent = totalValues > 0 ? ((notWritableCount / totalValues) * 100).toFixed(1) : '0.0';

  console.log(`  ${colors.green}Auto-writable:${colors.reset}          ${autoWritableCount} (${autoPercent}%)`);
  console.log(`  ${colors.yellow}Conditionally writable:${colors.reset} ${conditionallyWritableCount} (${condPercent}%)`);
  console.log(`  ${colors.red}Not writable:${colors.reset}           ${notWritableCount} (${notPercent}%)`);

  console.log();
  if (autoWritableCount > 0) {
    console.log(
      `  ${colors.green}→ ${autoWritableCount} value(s) could be automatically synchronized from design${colors.reset}`
    );
  }
  if (notWritableCount > 0) {
    console.log(
      `  ${colors.dim}→ ${notWritableCount} value(s) would require manual code changes${colors.reset}`
    );
  }
}

// =============================================================================
// MAIN CLI
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: pnpm --filter @aesthetic-function/watcher ast:write-feasibility <file>');
    console.error(
      'Example: pnpm --filter @aesthetic-function/watcher ast:write-feasibility demo-app/src/App.tsx'
    );
    process.exit(1);
  }

  const inputPath = args[0];
  const repoRoot = getRepoRoot();

  // Resolve path relative to repo root
  const absolutePath = resolve(repoRoot, inputPath);
  const relativePath = relative(repoRoot, absolutePath);

  // Read file
  let code: string;
  try {
    code = await readFile(absolutePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${absolutePath}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(colors.bold + 'WRITE FEASIBILITY ANALYSIS' + colors.reset);
  console.log(`File: ${relativePath}`);
  console.log(colors.dim + '(This is READ-ONLY analysis. No files will be modified.)' + colors.reset);

  // Run analysis
  const report = analyzeWriteFeasibility(code, relativePath);

  // Print per-node reports
  printHeader('NODE-BY-NODE ANALYSIS');
  for (const nodeReport of report.reports) {
    printNodeReport(nodeReport);
  }

  // Print summary
  printFileSummary(report);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
