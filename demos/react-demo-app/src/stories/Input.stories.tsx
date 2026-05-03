import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../Input';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

/** SDS: State=Default, Value Type=Placeholder */
export const Default: Story = {};

/** Password input variant */
export const Password: Story = {
  args: {
    label: 'Password',
    placeholder: 'Enter your password',
    type: 'password',
  },
};
