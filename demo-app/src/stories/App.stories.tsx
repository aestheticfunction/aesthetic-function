import type { Meta, StoryObj } from '@storybook/react-vite';
import { TestBox, WelcomeHeading } from '../App';

const meta: Meta = {
  title: 'Components/App',
};

export default meta;

// =============================================================================
// TEST BOX
// =============================================================================

export const Box: StoryObj<typeof TestBox> = {
  render: () => <TestBox />,
};

// =============================================================================
// WELCOME HEADING
// =============================================================================

export const Heading: StoryObj<typeof WelcomeHeading> = {
  render: () => <WelcomeHeading />,
};
