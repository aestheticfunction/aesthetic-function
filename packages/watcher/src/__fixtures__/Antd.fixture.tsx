/**
 * @file Ant Design Fixture (Phase 10B)
 *
 * Test fixtures for the Ant Design semantic adapter.
 * These are NOT actual component implementations - they're JSX structures
 * that the AST analyzer can parse to test semantic extraction.
 *
 * IMPORTANT: Each function must be exported and named appropriately
 * so tests can locate them by function name.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { Button, Input, Card, Tag } from 'antd';

// =============================================================================
// BUTTON FIXTURES
// =============================================================================

/**
 * Button with primary type and text content.
 */
export function ButtonPrimary() {
  return <Button type="primary">Submit</Button>;
}

/**
 * Button with danger variant.
 */
export function ButtonDanger() {
  return <Button danger>Delete</Button>;
}

/**
 * Button with danger and type combination (danger takes precedence).
 */
export function ButtonDangerWithType() {
  return (
    <Button type="primary" danger>
      Remove
    </Button>
  );
}

/**
 * Button with disabled state (literal true).
 */
export function ButtonDisabled() {
  return <Button disabled>Cannot Click</Button>;
}

/**
 * Button with disabled={true} explicit.
 */
export function ButtonDisabledExplicit() {
  return <Button disabled={true}>Explicitly Disabled</Button>;
}

/**
 * Button with disabled={false}.
 */
export function ButtonEnabled() {
  return <Button disabled={false}>Enabled</Button>;
}

/**
 * Button with bound disabled (variable - low confidence).
 */
export function ButtonDisabledBound() {
  const isDisabled = true;
  return <Button disabled={isDisabled}>Maybe Disabled</Button>;
}

/**
 * Button with size prop.
 */
export function ButtonLarge() {
  return (
    <Button type="primary" size="large">
      Large Button
    </Button>
  );
}

/**
 * Button with dashed type.
 */
export function ButtonDashed() {
  return <Button type="dashed">Dashed Button</Button>;
}

/**
 * Button with text type.
 */
export function ButtonText() {
  return <Button type="text">Text Button</Button>;
}

/**
 * Button with link type.
 */
export function ButtonLink() {
  return <Button type="link">Link Button</Button>;
}

/**
 * Button with default type (implicit).
 */
export function ButtonDefault() {
  return <Button>Default Button</Button>;
}

/**
 * Button with expression type (low confidence).
 */
export function ButtonDynamicType() {
  const buttonType = 'primary';
  return <Button type={buttonType}>Dynamic Type</Button>;
}

// =============================================================================
// INPUT FIXTURES
// =============================================================================

/**
 * Input with placeholder.
 */
export function InputWithPlaceholder() {
  return <Input placeholder="Enter your name" />;
}

/**
 * Input with disabled state.
 */
export function InputDisabled() {
  return <Input placeholder="Cannot edit" disabled />;
}

/**
 * Input with size prop.
 */
export function InputLarge() {
  return <Input placeholder="Large input" size="large" />;
}

/**
 * Input with bound disabled (variable - low confidence).
 */
export function InputDisabledBound() {
  const isDisabled = false;
  return <Input placeholder="Maybe editable" disabled={isDisabled} />;
}

/**
 * Input with no props (empty extraction).
 */
export function InputEmpty() {
  return <Input />;
}

// =============================================================================
// CARD FIXTURES
// =============================================================================

/**
 * Card with title.
 */
export function CardWithTitle() {
  return <Card title="Card Title">Card content here</Card>;
}

/**
 * Card with size prop.
 */
export function CardSmall() {
  return (
    <Card title="Small Card" size="small">
      Compact content
    </Card>
  );
}

/**
 * Card with no title (empty text extraction).
 */
export function CardNoTitle() {
  return <Card>Just content</Card>;
}

/**
 * Card with dynamic title (low confidence).
 */
export function CardDynamicTitle() {
  const title = 'Dynamic Title';
  return <Card title={title}>Dynamic content</Card>;
}

// =============================================================================
// TAG FIXTURES
// =============================================================================

/**
 * Tag with color.
 */
export function TagGreen() {
  return <Tag color="green">Success</Tag>;
}

/**
 * Tag with red color.
 */
export function TagRed() {
  return <Tag color="red">Error</Tag>;
}

/**
 * Tag with processing color (Ant Design preset).
 */
export function TagProcessing() {
  return <Tag color="processing">Processing</Tag>;
}

/**
 * Tag with no color (just text).
 */
export function TagDefault() {
  return <Tag>Default Tag</Tag>;
}

/**
 * Tag with dynamic color (low confidence).
 */
export function TagDynamicColor() {
  const tagColor = 'blue';
  return <Tag color={tagColor}>Dynamic Color</Tag>;
}

// =============================================================================
// NON-ANTD FIXTURES (for testing import detection)
// =============================================================================

/**
 * Local Button component - NOT from antd.
 * Should NOT be matched by the AntD adapter.
 */
function LocalButton(props: { children: React.ReactNode; type?: string }) {
  return <button>{props.children}</button>;
}

/**
 * Component using local Button, not antd Button.
 * Adapter should NOT match this.
 */
export function NotAntdButton() {
  return <LocalButton type="primary">Local Button</LocalButton>;
}

// =============================================================================
// MIXED IMPORT PATTERN FIXTURES (for testing antd + antd/es/*)
// =============================================================================

/**
 * This fixture demonstrates that both import patterns work:
 * - Named import from 'antd' (the Button imported at top)
 * - Default import from 'antd/es/*' (simulated via import map)
 *
 * IMPORTANT: The actual test uses a custom import map to simulate
 * both patterns. This fixture just provides the JSX structure.
 * See antd.test.ts for the mixed import detection tests.
 */

/**
 * Component using Button from main 'antd' import.
 */
export function MixedImportMainPackage() {
  return <Button type="primary">From antd package</Button>;
}

/**
 * Component demonstrating antd/es/* pattern would work.
 * In tests, we use a custom import map like: { EsButton: 'antd/es/button' }
 */
export function MixedImportEsPattern() {
  // This uses the Button from the top import, but tests can override
  // the import map to simulate antd/es/button detection
  return <Button type="dashed">From antd/es pattern</Button>;
}
