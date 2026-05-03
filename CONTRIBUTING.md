# Contributing to Aesthetic Function

This document covers development conventions and policies for the Aesthetic Function codebase.

---

## Test Stability Policy

### The Problem

Snapshot tests and deterministic assertions must produce consistent results across:
- Different machines
- Different developers
- CI environments

If tests read from mutable, human-editable files, they become fragile and unpredictable.

### The Solution: Fixtures vs Demo

We maintain a strict separation between **test fixtures** and **demo content**:

| Directory | Purpose | Stability | Used By |
|-----------|---------|-----------|---------|
| `packages/**/__fixtures__/` | Deterministic test inputs | ✅ Stable, version-controlled | Automated tests |
| `demos/react-demo-app/` | Human testing and demos | ❌ Mutable, freely editable | Manual testing only |

### Rules

1. **Automated tests MUST NOT read from `demos/react-demo-app/`**
   - No `readFileSync()` calls to `demos/react-demo-app/src/`
   - No imports from `demos/react-demo-app/`
   - No snapshots of `demos/react-demo-app/` content

2. **Snapshot tests MUST use fixtures**
   - Fixtures live in `packages/**/__fixtures__/`
   - Fixture files have explicit names (e.g., `App.fixture.tsx`)
   - Tests use helper functions like `readAppFixture()`

3. **Path strings are acceptable**
   - Using `'demos/react-demo-app/src/App.tsx'` as a path string in test data is fine
   - The rule is about *reading file content*, not *using path strings*

4. **`demos/react-demo-app/` is for humans only**
   - Developers can freely modify `demos/react-demo-app/` for testing
   - Demos and walkthroughs use `demos/react-demo-app/`
   - Breaking `demos/react-demo-app/` should never break CI

### Rationale

- **Determinism**: Fixtures provide identical input across all environments
- **Developer Freedom**: Edit `demos/react-demo-app/` without fear of breaking tests
- **Clear Ownership**: Fixtures are explicitly version-controlled test inputs

---

## Fixture Conventions

### Directory Structure

```
packages/
└── watcher/
    └── src/
        ├── __fixtures__/           # Shared fixtures for watcher package
        │   └── App.fixture.tsx     # Stable App component for AST tests
        ├── ast/
        │   └── __tests__/
        │       └── parseIntentFromReactAst.test.ts
        └── ...
```

### Naming Convention

- Fixture files: `<Name>.fixture.<ext>` (e.g., `App.fixture.tsx`)
- Snapshot files: Auto-generated in `__snapshots__/`

### Helper Pattern

Tests should use helper functions to read fixtures:

```typescript
const FIXTURE_PATH = 'fixtures/App.fixture.tsx';

function readAppFixture(): string {
  const fixturePath = join(__dirname, '..', '..', '__fixtures__', 'App.fixture.tsx');
  return readFileSync(fixturePath, 'utf-8');
}
```

The `FIXTURE_PATH` constant normalizes paths for snapshots, ensuring they're identical across machines.

### Adding New Fixtures

1. Create the fixture in the appropriate `__fixtures__/` directory
2. Use a `.fixture.` suffix in the filename
3. Add a helper function to read it
4. Use a normalized path constant for snapshot stability

---

## CI Guardrails

### Demo-App Test Isolation

A CI guardrail test (`no-demo-app-reads.test.ts`) enforces the test stability policy.

It scans all test files and fails if any test:
- Imports from `demos/react-demo-app/`
- Uses `readFileSync` or `readFile` to read from `demos/react-demo-app/`

### What Triggers CI Failure

```typescript
// ❌ FAILS CI - reading demo-app content
const code = readFileSync('demos/react-demo-app/src/App.tsx', 'utf-8');

// ❌ FAILS CI - importing from demo-app
import { App } from '../../../../demos/react-demo-app/src/App';
```

### What Passes CI

```typescript
// ✅ PASSES - using demo-app as a path string
const result = getPatchArtifactPath('demos/react-demo-app/src/App.tsx', '/repo');

// ✅ PASSES - reading from fixtures
const code = readAppFixture();

// ✅ PASSES - hardcoded path strings in test data
const filePath = 'demos/react-demo-app/src/App.tsx';
```

---

## Developer Certificate of Origin (DCO)

All contributions must include a Signed-off-by trailer:

```text
Signed-off-by: Your Name <your.email@example.com>
```

By signing off, you confirm that:
- You have the right to submit the contribution
- You agree to license it under Apache-2.0

This project uses the DCO as a lightweight contribution certification. No CLA is required.

---

## Project Direction / Architectural Constraints

This project enforces strict runtime boundaries:
- Watcher: code -> intent
- Server: relay + persistence
- Design Plugin: execution

Deterministic reconciliation is the core invariant.

Contributions must not:
- bypass reconciliation
- introduce direct mutation paths outside the defined flow
- blur runtime responsibilities

Core architectural changes must be discussed before implementation. Not all pull requests will be accepted if they violate these constraints.

---

## Contribution Workflow

- Fork the repository and create a branch for your change
- Make focused changes
- Ensure relevant tests pass
- Submit a pull request with a clear description

---

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @aesthetic-function/watcher test

# Update snapshots (after intentional fixture changes)
pnpm --filter @aesthetic-function/watcher test -- -u
```

### When to Update Fixtures

Update fixtures when:
- Adding new test cases that need stable input
- Changing expected AST behavior (requires snapshot updates)
- Adding support for new JSX patterns

Never update fixtures to match `demos/react-demo-app/` changes. Fixtures are their own source of truth.

### Human Testing

For manual testing and demos:
- Edit files in `demos/react-demo-app/` freely
- Use `pnpm dev:watcher` and `pnpm dev:server`
- See README.md for demo runbooks

---

## Code Style

- TypeScript everywhere
- Async/Await for all IO
- Functional React only
- Comment **why** a transformation exists

See `.github/instructions/aesthetic-function.instructions.md` for detailed guidelines.

---

## Semantic Adapter Priority Convention

Adapters are executed in priority order (lower numbers run first). To ensure deterministic behavior across adapters, follow these priority ranges:

| Range | Purpose | Examples |
|-------|---------|----------|
| 1–49 | Reserved for core/generic adapters | (none currently) |
| 50–59 | UI library semantic adapters | Vuetify=50, Ant Design=51 |
| 60–69 | Future UI libraries | MUI=60, Chakra=61, etc. |
| 70–99 | Reserved for custom/project-specific adapters | — |
| 100+ | Fallback/catch-all adapters | — |

**Rules:**
- Each adapter MUST have a unique, deterministic priority
- New UI library adapters should use the next available number in 50–59 (or 60–69 when full)
- Do not change existing priorities without updating all documentation
