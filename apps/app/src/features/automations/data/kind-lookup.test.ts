import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { PING_KIND_ID, pingKind, kindRow } from '../../../test-support/plugin-kinds';
import { kindLookupOf } from './kind-lookup';

describe('the app kind lookup', () => {
  it('is the static registry when no plugin kind is stored', () => {
    expect(kindLookupOf([])).toBe(NODE_REGISTRY);
  });

  it('answers for core kinds and for stored plugin kinds', () => {
    const lookup = kindLookupOf([kindRow()]);
    expect(lookup.get('device.set')).toBe(NODE_REGISTRY.get('device.set'));
    expect(lookup.get(PING_KIND_ID)?.name).toBe('Ping the demo');
    expect(lookup.has(PING_KIND_ID)).toBe(true);
    expect(lookup.kinds.length).toBe(NODE_REGISTRY.kinds.length + 1);
    expect(lookup.kinds.at(-1)?.id).toBe(PING_KIND_ID);
    expect(lookup.shipped().map((kind) => kind.id)).toContain(PING_KIND_ID);
  });

  it('still answers for a kind that is switched off or retired, with its stored declaration', () => {
    const off = kindLookupOf([kindRow('off')]);
    const retired = kindLookupOf([kindRow('retired')]);
    expect(off.get(PING_KIND_ID)?.inputs.map((port) => port.name)).toEqual(['target']);
    expect(retired.get(PING_KIND_ID)?.origin?.name).toBe('Demo');
  });

  it('keeps the core kind when a stored row uses a core id', () => {
    const clash = kindRow('active', pingKind('device.set'));
    const lookup = kindLookupOf([clash]);
    expect(lookup).toBe(NODE_REGISTRY);
    expect(lookup.get('device.set')).toBe(NODE_REGISTRY.get('device.set'));
  });

  it('rejects a repeated plugin id and a declaration that breaks the kind rules', () => {
    const broken = kindRow('active', { ...pingKind('plugin.demo.broken'), name: '' });
    const repeat = kindRow();
    const lookup = kindLookupOf([kindRow(), repeat, broken]);
    expect(lookup.kinds.filter((kind) => kind.id === PING_KIND_ID)).toHaveLength(1);
    expect(lookup.has('plugin.demo.broken')).toBe(false);
  });

  it('rejects a row whose declaration has another id than its key', () => {
    const odd = { ...kindRow(), kind_id: 'plugin.demo.other' };
    expect(kindLookupOf([odd])).toBe(NODE_REGISTRY);
  });

  it('returns the same lookup for the same stored rows', () => {
    const rows = [kindRow()];
    expect(kindLookupOf(rows)).toBe(kindLookupOf(rows));
  });
});
