/**
 * Card Component with @figma markers
 *
 * Demonstrates multiple markers in a single file.
 */

import React from 'react';

// @figma node=CardContainer fill=Neutral/Gray50
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#F9FAFB', // Neutral/Gray50
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {/* @figma node=CardTitle text="Card Title" */}
      <h2 style={{ margin: 0, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

// @figma node=SuccessButton text="Continue" fill=Success/Green500
export function SuccessButton() {
  return (
    <button
      style={{
        backgroundColor: '#10B981', // Success/Green500
        color: 'white',
        padding: '10px 20px',
        borderRadius: 6,
        border: 'none',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      Continue
    </button>
  );
}

// @figma node=ErrorButton text="Cancel" fill=Error/Red500
export function ErrorButton() {
  return (
    <button
      style={{
        backgroundColor: '#EF4444', // Error/Red500
        color: 'white',
        padding: '10px 20px',
        borderRadius: 6,
        border: 'none',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      Cancel
    </button>
  );
}
