import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { fanSpec } from '../visual/visual-fixture';
import { createInstanceGroups, type DrawInput } from './instancing';
import { createModelCache } from './model-cache';

function input(signals: DrawInput['signals']): DrawInput {
  return {
    spec: fanSpec(),
    model: { specHash: 'fan', lod: 0, finish: null, params: {} },
    theme: 'dark',
    signals,
    reduced: false,
    lit: false,
  };
}

describe('live instancing', () => {
  it('draws identical visible models from one shared scene', () => {
    const cache = createModelCache();
    const groups = createInstanceGroups(cache, new Texture());
    const shared = input({ speed: 0.5 });
    for (let index = 0; index < 23; index += 1) groups.join(`bulb-${String(index)}`, shared);
    expect(groups.groups()).toHaveLength(1);
    expect(groups.groups()[0]?.views.size).toBe(23);
    groups.join('other', input({ speed: 1 }));
    expect(groups.groups()).toHaveLength(2);
    expect(cache.hashes()).toHaveLength(1);
  });

  it('moves a view to a new group when its signals change and frees empty groups', () => {
    const cache = createModelCache();
    const groups = createInstanceGroups(cache, new Texture());
    const before = groups.join('fan', input({ speed: 0.5 }));
    const after = groups.join('fan', input({ speed: 1 }));
    expect(after).not.toBe(before);
    expect(groups.groups()).toEqual([after]);
    groups.leave('fan');
    expect(groups.groups()).toEqual([]);
    expect(cache.hashes()).toEqual([]);
  });

  it('evaluates the shared model once per frame', () => {
    const groups = createInstanceGroups(createModelCache(), new Texture());
    const group = groups.join('fan', input({ speed: 0.5 }));
    expect(group.prepare({ serial: 1, timeS: 0.1, decalShare: 0 })).toBe(true);
    const blades = group.model.object3d.getObjectByName('blades');
    const turned = blades?.rotation.z;
    expect(group.prepare({ serial: 1, timeS: 0.4, decalShare: 0 })).toBe(true);
    expect(blades?.rotation.z).toBe(turned);
    groups.dispose();
  });
});
