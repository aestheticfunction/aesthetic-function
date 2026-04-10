/**
 * App — AF Demo: Sign-in panel
 *
 * This is the ONLY file with @figma markers.
 * All markers use demo-facing node names for clean AF traceability.
 *
 * Cross-surface map:
 *   node=AuthCard        → Card.tsx       → Components/Card       → SDS Card (adapted)
 *   node=AuthCardTitle   → Card <h2>      → Components/Card       → SDS Card > Text
 *   node=EmailInput      → Input.tsx      → Components/Input      → SDS Input Field
 *   node=PasswordInput   → Input.tsx      → Components/Input      → SDS Input Field
 *   node=SignInButton    → Button.tsx     → Components/Button     → SDS Button Primary/Default
 *
 * AF instructions:
 * 1. Run the server:  pnpm dev:server
 * 2. Run the watcher: pnpm dev:watcher
 * 3. Edit marker values (fill, text) and save — Figma updates automatically.
 */

import React from 'react';
import { Card } from './Card';
import { Input } from './Input';
import { Button } from './Button';

// =============================================================================
// @figma markers — instance-level, demo-facing node names
// =============================================================================

// @figma node=AuthCard
// @figma node=AuthCardTitle text="Sign in"
// @figma node=EmailInput fill=#FFFFFF
// @figma node=PasswordInput fill=#FFFFFF
// @figma node=SignInButton fill=#2C2C2C text="Sign in"
// @figma node=SignInButton::hover fill=#1E1E1E

// =============================================================================
// App
// =============================================================================

export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <Card
        title="Sign in"
        description="Enter your credentials to continue."
      >
        <Input label="Email" type="email" placeholder="you@example.com" />
        <Input label="Password" type="password" placeholder="Enter your password" />
        <Button label="Sign in" />
      </Card>
    </div>
  );
}
