/**
 * Card — SDS-faithful layout, simplified anatomy
 *
 * Styling matches "Simple Design System" Card spacing and typography:
 *   No background fill         (SDS card frame has no fill)
 *   Space/400 → 16px           gap between title section and children
 *   Space/200 → 8px            gap between title and description
 *   Max-width 440px            (SDS card fixed width)
 *   Body/Size Medium → 16px Inter Regular
 *
 * Adapted for demo:
 *   – Vertical layout (SDS uses horizontal icon+body; simplified for sign-in use case)
 *   – title + optional description + children slot
 *   – AuthCardTitle (@figma node=AuthCardTitle) maps to the <h2> title element
 *   – No @figma markers — markers live in App.tsx only
 *   – SuccessButton / ErrorButton removed
 */

import React from 'react';

export interface CardProps {
  /** Card heading — maps to @figma node=AuthCardTitle in App.tsx */
  title: string;
  /** Optional subtitle below the title */
  description?: string;
  children: React.ReactNode;
}

export function Card({ title, description, children }: CardProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 440,
        width: '100%',
      }}
    >
      {/* Text section — title + description, gap 8px */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 600,
            color: '#1E1E1E',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: 16,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 400,
              color: '#6B7280',
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Children slot — inputs and buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}
