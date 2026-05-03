import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  args: {
    label: 'Button',
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

/** SDS: Variant=Primary, State=Default, Size=Medium */
export const Default: Story = {};

/** SDS: Variant=Primary, State=Disabled, Size=Medium */
export const Disabled: Story = {
  args: { disabled: true },
};
