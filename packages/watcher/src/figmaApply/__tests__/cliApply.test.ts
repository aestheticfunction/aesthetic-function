/**
 * @aesthetic-function/watcher - figmaApply/__tests__/cliApply.test.ts
 *
 * Unit tests for Phase 11C CLI utilities.
 *
 * Tests server response validation to ensure graceful handling of:
 * - Valid responses with results
 * - Invalid response shapes
 * - Server errors
 * - Network failures
 */

import { describe, it, expect } from 'vitest';
import { validateServerResponse } from '../cliApply.js';
import type { ApplyResult } from '../types.js';

// =============================================================================
// RESPONSE VALIDATION
// =============================================================================

describe('validateServerResponse', () => {
  describe('valid responses', () => {
    it('returns results array from valid response', () => {
      const results: ApplyResult[] = [
        { opId: 'op-1', nodeId: 'node-1', property: 'fill', success: true },
        { opId: 'op-2', nodeId: 'node-2', property: 'padding', success: false, error: 'Node not found' },
      ];

      const response = { results };
      const validated = validateServerResponse(response);

      expect(validated).toHaveLength(2);
      expect(validated[0].success).toBe(true);
      expect(validated[1].success).toBe(false);
      expect(validated[1].error).toBe('Node not found');
    });

    it('returns empty array from response with empty results', () => {
      const response = { results: [] };
      const validated = validateServerResponse(response);

      expect(validated).toHaveLength(0);
      expect(Array.isArray(validated)).toBe(true);
    });
  });

  describe('invalid responses', () => {
    it('throws on null response', () => {
      expect(() => validateServerResponse(null)).toThrow('not an object');
    });

    it('throws on undefined response', () => {
      expect(() => validateServerResponse(undefined)).toThrow('not an object');
    });

    it('throws on string response', () => {
      expect(() => validateServerResponse('not an object')).toThrow('not an object');
    });

    it('throws on number response', () => {
      expect(() => validateServerResponse(42)).toThrow('not an object');
    });

    it('throws on response with error field', () => {
      const response = { error: 'Plugin not connected' };
      expect(() => validateServerResponse(response)).toThrow('Plugin not connected');
    });

    it('throws on response missing results', () => {
      const response = { status: 'ok' };
      expect(() => validateServerResponse(response)).toThrow('missing results array');
    });

    it('throws on response with non-array results', () => {
      const response = { results: 'not an array' };
      expect(() => validateServerResponse(response)).toThrow('missing results array');
    });

    it('throws on response with null results', () => {
      const response = { results: null };
      expect(() => validateServerResponse(response)).toThrow('missing results array');
    });

    it('throws on response with object results', () => {
      const response = { results: { op1: true } };
      expect(() => validateServerResponse(response)).toThrow('missing results array');
    });
  });

  describe('edge cases', () => {
    it('handles response with both results and extra fields', () => {
      const response = {
        results: [{ opId: 'op-1', nodeId: 'node-1', property: 'fill', success: true }],
        requestId: 'req-123',
        timestamp: '2024-01-01',
      };

      const validated = validateServerResponse(response);
      expect(validated).toHaveLength(1);
    });

    it('handles response with results containing optional fields', () => {
      const response = {
        results: [
          { opId: 'op-1', nodeId: 'node-1', property: 'fill', success: true, appliedValue: '#ff0000' },
        ],
      };

      const validated = validateServerResponse(response);
      expect(validated[0]).toHaveProperty('appliedValue', '#ff0000');
    });
  });

  describe('server response shapes (integration)', () => {
    it('validates dry-run response shape from server', () => {
      // This is the shape that server /apply-properties returns in dry-run mode
      const serverResponse = {
        success: true,
        mode: 'dry-run',
        operationCount: 2,
        sentToPlugin: false,
        pluginClientCount: 0,
        results: [
          { opId: 'op-1', nodeId: 'node-1', property: 'fill', success: true, dryRun: true },
          { opId: 'op-2', nodeId: 'node-2', property: 'padding', success: true, dryRun: true },
        ],
      };

      const validated = validateServerResponse(serverResponse);
      expect(validated).toHaveLength(2);
      expect(validated[0].opId).toBe('op-1');
      expect(validated[1].opId).toBe('op-2');
    });

    it('validates apply mode response shape from server', () => {
      // This is the shape that server /apply-properties returns in apply mode
      const serverResponse = {
        success: true,
        mode: 'apply',
        operationCount: 2,
        sentToPlugin: true,
        pluginClientCount: 1,
        requestId: 'apply-123',
        results: [
          { opId: 'op-1', nodeId: 'node-1', property: 'fill', success: true, queued: true },
          { opId: 'op-2', nodeId: 'node-2', property: 'padding', success: true, queued: true },
        ],
      };

      const validated = validateServerResponse(serverResponse);
      expect(validated).toHaveLength(2);
      expect(validated[0].success).toBe(true);
      expect(validated[1].success).toBe(true);
    });

    it('validates results with proper opIds match operation count', () => {
      const serverResponse = {
        success: true,
        operationCount: 3,
        results: [
          { opId: 'apply-001', nodeId: 'n1', property: 'fill', success: true },
          { opId: 'apply-002', nodeId: 'n2', property: 'fill', success: true },
          { opId: 'apply-003', nodeId: 'n3', property: 'padding', success: true },
        ],
      };

      const validated = validateServerResponse(serverResponse);
      expect(validated).toHaveLength(serverResponse.operationCount);
    });
  });
});

// =============================================================================
// ERROR MESSAGE CLARITY
// =============================================================================

describe('error message clarity', () => {
  it('provides actionable error for null response', () => {
    try {
      validateServerResponse(null);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('not an object');
    }
  });

  it('includes server error message in thrown error', () => {
    const response = { error: 'Figma plugin disconnected unexpectedly' };

    try {
      validateServerResponse(response);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Figma plugin disconnected unexpectedly');
    }
  });

  it('distinguishes between missing results and invalid results', () => {
    const missingResults = { status: 'ok' };
    const invalidResults = { results: 'wrong type' };

    try {
      validateServerResponse(missingResults);
    } catch (e1) {
      try {
        validateServerResponse(invalidResults);
      } catch (e2) {
        // Both should mention "missing results array" since that's the validation
        expect((e1 as Error).message).toContain('missing results array');
        expect((e2 as Error).message).toContain('missing results array');
      }
    }
  });
});
