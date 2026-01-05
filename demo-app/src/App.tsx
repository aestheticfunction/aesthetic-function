/**
 * Demo React Component with @figma markers
 *
 * This file demonstrates the @figma marker syntax for syncing
 * React components to Figma.
 *
 * MARKER FORMAT:
 *   // @figma node=<FigmaNodeName> text="<Text>" fill=<TokenOrHex>
 *
 * INSTRUCTIONS:
 * 1. Run the server: pnpm dev:server
 * 2. Run the watcher: pnpm dev:watcher
 * 3. Edit this file (change text or fill values)
 * 4. Save - the Figma plugin will update automatically!
 *
 * In Figma, create nodes named "LoginButton" and "TestBox" to see updates.
 */

import React from 'react';

// =============================================================================
// LOGIN BUTTON
// =============================================================================

// @figma node=LoginButton text="Login" fill=#0000FF
// @figma node=LoginButton::hover text="Hover" fill=#2563EB
export function LoginButton() {
  return (
    <button
      style={{
        backgroundColor: '#0000FF', // Primary/Blue500
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer'
      }}>

      Continue
    </button>);

}

// =============================================================================
// TEST BOX
// =============================================================================

// @figma node=TestBox fill=#FF0000
export function TestBox() {
  return (
    <div
      style={{
        width: 100,
        height: 100,
        backgroundColor: '#FF0000',
        borderRadius: 8
      }} />);


}

// =============================================================================
// WELCOME HEADING
// =============================================================================

// @figma node=WelcomeText text="Welcome to the Demo"
export function WelcomeHeading() {
  return <h1>Welcome to the Demo</h1>;
}

// =============================================================================
// APP
// =============================================================================

export default function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <WelcomeHeading />
      <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
        <LoginButton />
        <TestBox />
      </div>
    </div>);

}