/**
 * Input — SDS-faithful
 *
 * Styling matches "Simple Design System" Input Field (Default, Placeholder):
 *   Text/Default/Default      → #1E1E1E (label)
 *   Background/Default        → #FFFFFF (input bg)
 *   Border/Default/Default    → #D9D9D9, 1px (input border)
 *   Text/Default/Tertiary     → #B3B3B3 (placeholder)
 *   Radius/200                → 8px
 *   Space/400                 → 16px horizontal padding
 *   Space/300                 → 12px vertical padding
 *   Space/200                 → 8px gap label→input
 *   Body/Size Medium          → 16px Inter Regular
 *   Label line-height         → 140%
 *
 * Adapted for demo:
 *   – No error/disabled states
 *   – No @figma markers — markers live in App.tsx only
 */

import React from 'react';

export interface InputProps {
  /** Label text displayed above the input */
  label?: string;
  /** Placeholder text inside the input */
  placeholder?: string;
  /** Input type */
  type?: 'text' | 'email' | 'password';
}

export function Input({ label = 'Label', placeholder = 'Value', type = 'text' }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240, width: '100%' }}>
      <label
        style={{
          color: '#1E1E1E',
          fontSize: 16,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 400,
          lineHeight: 1.4,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 16,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 400,
          color: '#1E1E1E',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
