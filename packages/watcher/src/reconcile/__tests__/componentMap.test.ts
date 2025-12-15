import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadComponentMap,
  saveComponentMap,
  mergeMapUpdate,
  resolveFromMap,
  createIdQuery,
  parseIdQuery,
  setComponentMapPath,
  getComponentMapPath,
  COMPONENT_MAP_VERSION,
  type ComponentMap,
  type MapUpdatePayload,
} from '../componentMap.js';

describe('componentMap', () => {
  let tempDir: string;
  let tempMapPath: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = join(tmpdir(), `componentmap-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    tempMapPath = join(tempDir, 'component-map.json');
    setComponentMapPath(tempMapPath);
  });

  afterEach(async () => {
    // Cleanup temp files
    setComponentMapPath(null);
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadComponentMap', () => {
    it('returns null when file does not exist', async () => {
      const result = await loadComponentMap();
      expect(result).toBeNull();
    });

    it('loads a valid component map', async () => {
      const map: ComponentMap = {
        version: 1,
        components: {
          LoginButton: {
            figma: {
              name: 'LoginButton',
              componentSetNodeId: '12:34',
              variants: {
                base: { nodeId: '12:35' },
                hover: { nodeId: '12:36' },
              },
            },
          },
        },
      };
      await writeFile(tempMapPath, JSON.stringify(map), 'utf-8');

      const result = await loadComponentMap();
      expect(result).toEqual(map);
    });

    it('throws on invalid JSON', async () => {
      await writeFile(tempMapPath, '{ invalid json }', 'utf-8');

      await expect(loadComponentMap()).rejects.toThrow();
    });

    it('throws on missing version field', async () => {
      await writeFile(tempMapPath, '{ "components": {} }', 'utf-8');

      await expect(loadComponentMap()).rejects.toThrow('Missing or invalid version field');
    });

    it('throws on version newer than supported', async () => {
      await writeFile(
        tempMapPath,
        JSON.stringify({ version: 999, components: {} }),
        'utf-8'
      );

      await expect(loadComponentMap()).rejects.toThrow('is newer than supported');
    });
  });

  describe('saveComponentMap', () => {
    it('saves component map to file', async () => {
      const map: ComponentMap = {
        version: 1,
        components: {
          TestButton: {
            figma: {
              name: 'TestButton',
              variants: {
                base: { nodeId: '1:2' },
              },
            },
          },
        },
      };

      await saveComponentMap(map);
      const result = await loadComponentMap();
      expect(result).toEqual(map);
    });
  });

  describe('mergeMapUpdate', () => {
    it('creates new map when none exists', () => {
      const update: MapUpdatePayload = {
        baseName: 'LoginButton',
        componentSetNodeId: '12:34',
        variantState: 'hover',
        variantNodeId: '12:36',
      };

      const { map, changed } = mergeMapUpdate(null, update);

      expect(changed).toBe(true);
      expect(map.version).toBe(COMPONENT_MAP_VERSION);
      expect(map.components.LoginButton).toBeDefined();
      expect(map.components.LoginButton.figma.componentSetNodeId).toBe('12:34');
      expect(map.components.LoginButton.figma.variants.hover.nodeId).toBe('12:36');
    });

    it('adds new component to existing map', () => {
      const existing: ComponentMap = {
        version: 1,
        components: {
          ExistingButton: {
            figma: {
              name: 'ExistingButton',
              variants: { base: { nodeId: '1:1' } },
            },
          },
        },
      };

      const update: MapUpdatePayload = {
        baseName: 'NewButton',
        variantState: null,
        variantNodeId: '2:2',
      };

      const { map, changed } = mergeMapUpdate(existing, update);

      expect(changed).toBe(true);
      expect(map.components.ExistingButton).toBeDefined();
      expect(map.components.NewButton).toBeDefined();
      expect(map.components.NewButton.figma.variants.base.nodeId).toBe('2:2');
    });

    it('adds new variant to existing component', () => {
      const existing: ComponentMap = {
        version: 1,
        components: {
          LoginButton: {
            figma: {
              name: 'LoginButton',
              componentSetNodeId: '12:34',
              variants: { base: { nodeId: '12:35' } },
            },
          },
        },
      };

      const update: MapUpdatePayload = {
        baseName: 'LoginButton',
        componentSetNodeId: '12:34',
        variantState: 'hover',
        variantNodeId: '12:36',
      };

      const { map, changed } = mergeMapUpdate(existing, update);

      expect(changed).toBe(true);
      expect(map.components.LoginButton.figma.variants.base.nodeId).toBe('12:35');
      expect(map.components.LoginButton.figma.variants.hover.nodeId).toBe('12:36');
    });

    it('returns changed=false when update is idempotent', () => {
      const existing: ComponentMap = {
        version: 1,
        components: {
          LoginButton: {
            figma: {
              name: 'LoginButton',
              componentSetNodeId: '12:34',
              variants: { hover: { nodeId: '12:36' } },
            },
          },
        },
      };

      const update: MapUpdatePayload = {
        baseName: 'LoginButton',
        componentSetNodeId: '12:34',
        variantState: 'hover',
        variantNodeId: '12:36',
      };

      const { changed } = mergeMapUpdate(existing, update);

      expect(changed).toBe(false);
    });

    it('uses "base" as variant key for null state', () => {
      const update: MapUpdatePayload = {
        baseName: 'LoginButton',
        variantState: null,
        variantNodeId: '12:35',
      };

      const { map } = mergeMapUpdate(null, update);

      expect(map.components.LoginButton.figma.variants.base).toBeDefined();
      expect(map.components.LoginButton.figma.variants.base.nodeId).toBe('12:35');
    });
  });

  describe('resolveFromMap', () => {
    const map: ComponentMap = {
      version: 1,
      components: {
        LoginButton: {
          figma: {
            name: 'LoginButton',
            componentSetNodeId: '12:34',
            variants: {
              base: { nodeId: '12:35' },
              hover: { nodeId: '12:36' },
              disabled: { nodeId: '12:37' },
            },
          },
        },
      },
    };

    it('returns nodeId for existing base variant', () => {
      const result = resolveFromMap(map, 'LoginButton', null);

      expect(result.found).toBe(true);
      expect(result.nodeId).toBe('12:35');
      expect(result.source).toBe('map');
    });

    it('returns nodeId for existing state variant', () => {
      const result = resolveFromMap(map, 'LoginButton', 'hover');

      expect(result.found).toBe(true);
      expect(result.nodeId).toBe('12:36');
      expect(result.source).toBe('map');
    });

    it('returns not found for missing component', () => {
      const result = resolveFromMap(map, 'NonExistent', null);

      expect(result.found).toBe(false);
      expect(result.nodeId).toBeNull();
      expect(result.source).toBe('none');
    });

    it('returns not found for missing variant', () => {
      const result = resolveFromMap(map, 'LoginButton', 'pressed');

      expect(result.found).toBe(false);
      expect(result.nodeId).toBeNull();
      expect(result.source).toBe('none');
    });

    it('returns not found when map is null', () => {
      const result = resolveFromMap(null, 'LoginButton', null);

      expect(result.found).toBe(false);
      expect(result.nodeId).toBeNull();
      expect(result.source).toBe('none');
    });
  });

  describe('createIdQuery', () => {
    it('creates id: prefixed query', () => {
      expect(createIdQuery('12:34')).toBe('id:12:34');
    });
  });

  describe('parseIdQuery', () => {
    it('parses id: prefixed query', () => {
      expect(parseIdQuery('id:12:34')).toBe('12:34');
    });

    it('returns null for non-id query', () => {
      expect(parseIdQuery('LoginButton')).toBeNull();
      expect(parseIdQuery('LoginButton::hover')).toBeNull();
    });
  });

  describe('getComponentMapPath', () => {
    it('returns custom path when set', () => {
      expect(getComponentMapPath()).toBe(tempMapPath);
    });
  });
});
