# reconciliationCi

Phase 13F.1: CI Trend Thresholds & Window Policy Hardening

## Overview

The CI Gate module provides trend-based CI integration for design drift monitoring.
It computes stability score trends across reconciliation runs and produces deterministic
pass/fail verdicts suitable for CI pipelines.

## Key Concepts

### Trend Policy

The CI gate uses a **trend policy** to configure how trends are computed and evaluated:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `window` | 5 | Number of recent runs to include in trend analysis |
| `improvingDelta` | 5 | Minimum score increase to be considered "improving" |
| `worseningDelta` | -5 | Threshold for score decrease to be considered "worsening" |
| `failOnWorsening` | true | Whether worsening trends cause CI failure in strict mode |
| `maxFiles` | 20 | Maximum files to evaluate for trends |

### Trend Direction Rules

The trend direction is determined by the score delta (newest - oldest):

- **Improving**: `scoreDelta >= improvingDelta` (e.g., +5 or more)
- **Worsening**: `scoreDelta <= worseningDelta` (e.g., -5 or less)
- **Stable**: Everything in between

### CI Verdict Rules

The CI verdict is determined by trend analysis:

| Condition | Verdict | Exit Code |
|-----------|---------|-----------|
| No worsening files | PASS | 0 |
| Worsening files, strict mode, failOnWorsening | FAIL | 1 |
| Worsening files, non-strict or !failOnWorsening | WARN | 0 |
| Invalid configuration | - | 2 |

## Configuration

### Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `RECONCILIATION_CI_TREND_WINDOW` | number | Trend window size |
| `RECONCILIATION_CI_IMPROVING_DELTA` | number | Improving threshold (must be > 0) |
| `RECONCILIATION_CI_WORSENING_DELTA` | number | Worsening threshold (must be < 0) |
| `RECONCILIATION_CI_FAIL_ON_WORSENING` | boolean | Fail CI on worsening trends |
| `RECONCILIATION_CI_MAX_FILES` | number | Maximum files to evaluate |
| `RECONCILIATION_CI_STRICT` | boolean | Enable strict mode |

### CLI Flags

```bash
pnpm figma:ci [scan-root] [options]

Options:
  --strict              Enable strict mode (exit code 1 on FAIL verdict)
  --no-strict           Disable strict mode
  --window <n>          Trend window size (default: 5)
  --improving-delta <n> Score delta for improving trend (default: 5)
  --worsening-delta <n> Score delta for worsening trend (default: -5)
  --fail-on-worsening   Fail CI when worsening trends detected (default: true)
  --no-fail-on-worsening Allow worsening trends without CI failure
  --max-files <n>       Maximum files to evaluate (default: 20)
  --output <path>       Custom output path for artifact
  --help                Show help message
```

### Precedence

Configuration is resolved with the following precedence (highest first):

1. CLI flags
2. Environment variables
3. Default values

## Example Output

```
──────────────────────────────────────────────────────────────────────────────────
                              CI TREND POLICY
──────────────────────────────────────────────────────────────────────────────────
  Window: 5 runs
  Improving: ≥ +5 points
  Worsening: ≤ -5 points
  Fail on Worsening: true
  Max Files: 20
──────────────────────────────────────────────────────────────────────────────────

CI Gate Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trend Analysis (5-run window)
  ✓ Improving: 2 files
  ○ Stable: 3 files
  ⚠ Worsening: 0 files
  ○ Insufficient data: 1 file

Verdict: PASS
Exit code: 0
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (PASS or WARN verdict) |
| 1 | Failure (FAIL verdict in strict mode) |
| 2 | Invalid configuration |

## Invariants

The trend policy enforces the following invariants:

- `window >= 1`: Must analyze at least 1 run
- `improvingDelta > 0`: Improving threshold must be positive
- `worseningDelta < 0`: Worsening threshold must be negative
- `maxFiles >= 1`: Must evaluate at least 1 file

If any invariant is violated, the CLI exits with code 2 and displays an error message.

## Module Exports

### Types

- `CiTrendPolicy`: Trend policy configuration
- `CiGateContext`: Context for CI gate computation
- `CiGateArtifact`: Output artifact with verdict and trends
- `CiVerdictMessage`: Verdict with severity level

### Functions

- `resolveTrendPolicy(cli?)`: Resolve trend policy from CLI/env/defaults
- `validateTrendPolicy(policy)`: Validate policy invariants
- `formatTrendPolicy(policy)`: Format policy for CLI display
- `determineCiVerdict(worsening, strict, failOnWorsening)`: Determine CI verdict
- `computeCiGate(context)`: Compute CI gate artifact
- `getCiVerdictMessage(verdict)`: Get verdict message with severity

## Files

- `types.ts`: Type definitions and constants
- `config.ts`: Policy resolution and validation
- `compute.ts`: Core computation logic
- `artifact.ts`: Artifact writing
- `cliCi.ts`: CLI entry point
- `index.ts`: Public exports
