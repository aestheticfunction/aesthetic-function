import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from '../Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  args: {
    title: 'Card Title',
    children: 'Card content goes here.',
  },
};

export default meta;

type Story = StoryObj<typeof Card>;

/** SDS: Card (adapted vertical layout, no fill) */
export const Default: Story = {};

/** Card with optional description */
export const WithDescription: Story = {
  args: {
    title: 'Card Title',
    description: 'Supporting text that provides additional context.',
    children: 'Card content goes here.',
  },
};
