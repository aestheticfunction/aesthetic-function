import React from 'react';

// @figma node=DemoButton fill=#3B82F6 text="Click me"
// @figma node=DemoButton::hover fill=#2563EB

export interface DemoButtonProps {
  /** Visual variant matching Figma component set property "State" */
  variant?: 'Default' | 'Hover';
  /** Button label text */
  label?: string;
}

export function DemoButton({ variant = 'Default', label = 'Click me' }: DemoButtonProps) {
  const isHover = variant === 'Hover';

  return (
    <button
      style={{
        backgroundColor: isHover ? '#2563EB' : '#3B82F6',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
