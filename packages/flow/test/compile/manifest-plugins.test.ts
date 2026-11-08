import type { InputPortDecl, PortValue } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { lower } from '../../src/compile/lower';
import type { ManifestKind, ManifestKinds } from '../../src/compile/manifest';
import {
  entityPluginId,
  entityRef,
  manifestOf,
  MANIFEST_SLOTS,
  splitEntityRef,
} from '../../src/compile/manifest';
import type { Plan } from '../../src/compile/plan';
import { automation, lit, make, wired } from './support';

const none = (): undefined => undefined;

const port = (name: string, type: InputPortDecl['type']): InputPortDecl => ({
  name,
  type,
  required: false,
  description: name,
});

const CHANNEL = { t: 'entity', of: 'discord.channel' } as const;

const send: ManifestKind = {
  id: 'plugin.discord.send',
  access: 'member',
  origin: { kind: 'plugin', id: 'discord', name: 'Discord', icon: 'chat', version: '1.0.0' },
  inputs: [
    port('channel', CHANNEL),
    port('also', { t: 'list', of: CHANNEL }),
    port('text', { t: 'text' }),
  ],
};

const driverKind: ManifestKind = {
  id: 'plugin.driver_wiz.scene',
  access: 'member',
  origin: { kind: 'driver', id: 'wiz', name: 'WiZ', icon: 'bulb', version: '1.0.0' },
  inputs: [port('text', { t: 'text' })],
};

const kinds: ManifestKinds = (id) =>
  id === send.id ? send : id === driverKind.id ? driverKind : NODE_REGISTRY.get(id);

function planOf(kind: ManifestKind, ports: Record<string, PortValue>): Plan {
  const result = lower(automation([make('n', kind.id, ports)]), {
    kinds: (id) =>
      id === kind.id
        ? { ...kind, class: 'effect', exits: [], effect: { retry: 'idempotent', budget: 'none' } }
        : NODE_REGISTRY.get(id),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

describe('manifest plugin and entity slots', () => {
  it('declares the two slots after the existing ones', () => {
    expect(MANIFEST_SLOTS.slice(-2)).toEqual(['plugin', 'entity']);
  });

  it('lists the plugin of a plugin node and the entities it names, by type and id', () => {
    const manifest = manifestOf(
      planOf(send, { channel: lit('c1'), also: lit(['c2', 'c3']), text: lit('hi') }),
      kinds,
      none,
    );
    expect(manifest.uses.plugin).toEqual(['discord']);
    expect(manifest.uses.entity).toEqual([
      'discord.channel:c1',
      'discord.channel:c2',
      'discord.channel:c3',
    ]);
    expect(manifest.dynamic).toEqual([]);
  });

  it('marks entity as dynamic for a wired entity and still lists the plugin', () => {
    const manifest = manifestOf(
      planOf(send, { channel: wired('src.value'), text: lit('hi') }),
      kinds,
      none,
    );
    expect(manifest.uses.entity).toEqual([]);
    expect(manifest.dynamic).toEqual(['entity']);
    expect(manifest.uses.plugin).toEqual(['discord']);
  });

  it('lists a plugin even when no entity is used, and ignores a literal of the wrong shape', () => {
    const manifest = manifestOf(planOf(send, { channel: lit(7), text: lit('hi') }), kinds, none);
    expect(manifest.uses.plugin).toEqual(['discord']);
    expect(manifest.uses.entity).toEqual([]);
  });

  it('does not list a driver as a plugin', () => {
    const manifest = manifestOf(planOf(driverKind, { text: lit('x') }), kinds, none);
    expect(manifest.uses.plugin).toEqual([]);
  });

  it('keeps core programs free of plugin and entity uses', () => {
    const manifest = manifestOf(
      planOf(
        {
          id: 'device.set',
          access: 'member',
          inputs: NODE_REGISTRY.get('device.set')?.inputs ?? [],
        },
        { target: lit({ device: 'lamp' }), to: lit(true) },
      ),
      kinds,
      none,
    );
    expect(manifest.uses.plugin).toEqual([]);
    expect(manifest.uses.entity).toEqual([]);
  });
});

describe('entity references', () => {
  it('round-trips a reference whose id contains a colon', () => {
    const ref = entityRef('discord.emoji', 'party:123');
    expect(splitEntityRef(ref)).toEqual({ of: 'discord.emoji', id: 'party:123' });
    expect(entityPluginId('discord.emoji')).toBe('discord');
  });
});
