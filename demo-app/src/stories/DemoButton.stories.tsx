import type { Meta, StoryObj } from '@storybook/react-vite';
import { DemoButton } from '../DemoButton';

const meta: Meta<typeof DemoButton> = {
  title: 'Components/DemoButton',
  component: DemoButton,
  args: {
    label: 'Click me',
    variant: 'Default',
  },
};

export default meta;

type Story = StoryObj<typeof DemoButton>;

export const Default: Story = {};

export const Hover: Story = {
  args: { variant: 'Hover' },
};
