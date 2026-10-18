import { HARNESS_EXTENSION_ITEM, type HarnessExtensionItem } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { matchesExtension, patched } from './items';

function item(overrides: Partial<HarnessExtensionItem>): HarnessExtensionItem {
  return HARNESS_EXTENSION_ITEM.parse({
    id: 'plugin:demo',
    kind: 'plugin',
    name: 'Demo',
    description: 'A demo plugin',
    publisher: 'Someone',
    license: null,
    capabilities: [],
    requirements: [],
    platforms: ['linux'],
    source: { kind: 'included' },
    version: 'abc',
    enabled: false,
    executes: true,
    confirmed: false,
    config: { a: 1 },
    ...overrides,
  });
}

describe('patched', () => {
  it('applies a toggle without touching the rest', () => {
    const next = patched(item({}), { enabled: true });
    expect(next.enabled).toBe(true);
    expect(next.config).toEqual({ a: 1 });
    expect(next.confirmed).toBe(false);
  });

  it('replaces the config and confirms execution only for executing items', () => {
    const next = patched(item({}), { config: { b: 2 }, confirm_executes: true });
    expect(next.config).toEqual({ b: 2 });
    expect(next.confirmed).toBe(true);
    expect(patched(item({ executes: false }), { confirm_executes: true }).confirmed).toBe(false);
  });
});

describe('matchesExtension', () => {
  it('matches name, description and publisher case-insensitively', () => {
    expect(matchesExtension(item({}), 'DEMO')).toBe(true);
    expect(matchesExtension(item({}), 'someone')).toBe(true);
    expect(matchesExtension(item({}), 'nothing')).toBe(false);
  });
});
