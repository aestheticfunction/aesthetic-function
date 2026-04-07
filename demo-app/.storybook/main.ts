import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-mcp',
  ],
  framework: '@storybook/react-vite',
  features: {
    componentsManifest: true,
  },
};

export default config;
