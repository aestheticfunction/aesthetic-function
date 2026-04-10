/**
 * Button — SDS-faithful, Primary variant
 *
 * Styling matches "Simple Design System" Button (Primary, Medium):
 *   Background/Brand/Default  → #2C2C2C (Default)
 *   Background/Brand/Hover    → #1E1E1E (Hover — CSS :hover)
 *   Background/Disabled       → #D9D9D9 (disabled prop)
 *   Text/Brand/On Brand       → #F5F5F5
 *   Border/Brand/Default      → #2C2C2C, 1px
 *   Radius/200                → 8px
 *   Space/300                 → 12px padding
 *   Body/Size Medium          → 16px Inter Regular
 *
 * Adapted for demo:
 *   – Only Primary variant (Neutral/Subtle omitted)
 *   – No @figma markers — markers live in App.tsx only
 */

import React from 'react';

export interface ButtonProps {
  /** Button label text */
  label?: string;
  /** Disabled state — styled but no @figma marker (demo noise reduction) */
  disabled?: boolean;
  onClick?: () => void;
}

export function Button({ label = 'Button', disabled = false, onClick }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 12px',
        backgroundColor: disabled ? '#D9D9D9' : '#2C2C2C',
        color: disabled ? '#B3B3B3' : '#F5F5F5',
        border: `1px solid ${disabled ? '#B3B3B3' : '#2C2C2C'}`,
        borderRadius: 8,
        fontSize: 16,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 400,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1E1E1E';
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2C2C2C';
        }
      }}
    >
      {label}
    </button>
  );
}
