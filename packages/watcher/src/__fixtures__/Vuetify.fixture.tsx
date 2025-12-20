/**
 * Vuetify Component Fixture for Adapter Tests (Phase 10A)
 *
 * This fixture contains Vuetify-style components for testing the
 * VuetifySemanticAdapter. It uses Vuetify's component naming conventions
 * (v-btn, v-card, v-text-field, v-chip) but is NOT actual Vuetify code.
 *
 * ⚠️ This file is intentionally NOT valid TypeScript.
 *    It is read as text and parsed by Babel for AST analysis.
 *    TypeScript errors are expected and should be ignored.
 *
 * IMPORTANT: Do not modify this fixture without updating the corresponding
 * snapshot tests in adapters/__tests__/vuetify.test.ts
 */

// =============================================================================
// V-BTN EXAMPLES
// =============================================================================

// @figma node=LoginButton
export function LoginButton() {
  return (
    <v-btn color="primary" size="large">
      Sign In
    </v-btn>
  );
}

// @figma node=DisabledButton
export function DisabledButton() {
  return (
    <v-btn color="error" disabled>
      Cannot Click
    </v-btn>
  );
}

// @figma node=OutlinedButton
export function OutlinedButton() {
  return (
    <v-btn color="success" variant="outlined">
      Outlined Style
    </v-btn>
  );
}

// =============================================================================
// V-CARD EXAMPLES
// =============================================================================

// @figma node=ProfileCard
export function ProfileCard() {
  return (
    <v-card width={300} height={400} elevation={4} title="User Profile">
      <p>Card content here</p>
    </v-card>
  );
}

// @figma node=SimpleCard
export function SimpleCard() {
  return (
    <v-card width="200" subtitle="Card subtitle">
      Simple card content
    </v-card>
  );
}

// =============================================================================
// V-TEXT-FIELD EXAMPLES
// =============================================================================

// @figma node=EmailInput
export function EmailInput() {
  return (
    <v-text-field label="Email Address" />
  );
}

// @figma node=DisabledInput
export function DisabledInput() {
  return (
    <v-text-field label="Disabled Field" disabled />
  );
}

// =============================================================================
// V-CHIP EXAMPLES
// =============================================================================

// @figma node=StatusChip
export function StatusChip() {
  return (
    <v-chip color="success">
      Active
    </v-chip>
  );
}

// @figma node=OutlinedChip
export function OutlinedChip() {
  return (
    <v-chip color="info" variant="outlined">
      Info Chip
    </v-chip>
  );
}

// =============================================================================
// MIXED COMPONENT (Has both Vuetify and regular HTML)
// =============================================================================

// @figma node=MixedComponent
export function MixedComponent() {
  return (
    <div>
      <h1>Title</h1>
      <v-btn color="primary">Click Me</v-btn>
      <p>Some text</p>
    </div>
  );
}

// =============================================================================
// NON-VUETIFY COMPONENTS (Should be ignored by adapter)
// =============================================================================

// @figma node=RegularButton
export function RegularButton() {
  return (
    <button style={{ backgroundColor: '#3B82F6' }}>
      Regular HTML Button
    </button>
  );
}

// @figma node=DynamicProps
export function DynamicProps() {
  const buttonColor = 'primary';
  const isDisabled = true;
  return (
    <v-btn color={buttonColor} disabled={isDisabled}>
      Dynamic Props (low confidence)
    </v-btn>
  );
}
