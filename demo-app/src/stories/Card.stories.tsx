import type { Meta, StoryObj } from '@storybook/react';
import { Card, SuccessButton, ErrorButton } from '../Card';

// =============================================================================
// CARD
// =============================================================================

const cardMeta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  args: {
    title: 'Card Title',
    children: 'Card content goes here.',
  },
};

export default cardMeta;

type CardStory = StoryObj<typeof Card>;

export const Default: CardStory = {};

export const WithLongTitle: CardStory = {
  args: { title: 'A Very Long Card Title That Wraps' },
};

// =============================================================================
// SUCCESS BUTTON (co-located for simplicity)
// =============================================================================

export const Success: StoryObj<typeof SuccessButton> = {
  render: () => <SuccessButton />,
};

// =============================================================================
// ERROR BUTTON (co-located for simplicity)
// =============================================================================

export const Error: StoryObj<typeof ErrorButton> = {
  render: () => <ErrorButton />,
};
