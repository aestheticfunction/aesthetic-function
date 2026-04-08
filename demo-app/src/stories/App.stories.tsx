import type { Meta, StoryObj } from '@storybook/react-vite';
import { DemoButton, TestBox, WelcomeHeading } from '../App';

// =============================================================================
// DEMO BUTTON
// =============================================================================

const buttonMeta: Meta<typeof DemoButton> = {
  title: 'Components/DemoButton',
  component: DemoButton,
};

export default buttonMeta;

type ButtonStory = StoryObj<typeof DemoButton>;

export const Default: ButtonStory = {};

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
