import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NavPinTarget } from '@smarteverything/domain';
import { pinLeafOf } from './pin-leaves';
import { LEAF_ROUTES, leafRoutesOf, singularIdOf } from './pin-routes';
import { navTargetKey, pinnableTarget } from './nav-targets';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const APP = join(__dirname, '..', '..', 'app', '(app)');

function routeFiles(directory: string, prefix = ''): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return routeFiles(join(directory, entry.name), `${prefix}${entry.name}/`);
    return entry.name.endsWith('.tsx') ? [`${prefix}${entry.name.replace(/\.tsx$/u, '')}`] : [];
  });
}

function namesOfGroup(group: string): readonly string[] {
  return readdirSync(APP, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name.slice(1, -1).split(',').includes(group.slice(1, -1)),
    )
    .flatMap((entry) => routeFiles(join(APP, entry.name)));
}

describe('the pin leaves', () => {
  it('map every kind of page that can be pinned to the stack that hosts it', () => {
    const targets: readonly NavPinTarget[] = [
      { kind: 'device', deviceId: ID, focus: null },
      { kind: 'camera', deviceId: ID },
      { kind: 'room', roomId: ID },
      { kind: 'group', groupId: ID },
      { kind: 'scene', sceneId: ID },
      { kind: 'automation', automationId: ID, focus: null },
    ];
    const leaves = targets.map((target) => pinLeafOf(target));
    expect(leaves.map((leaf) => leaf?.group)).toEqual([
      '(home)',
      '(cameras)',
      '(home)',
      '(home)',
      '(automations)',
      '(automations)',
    ]);
    expect(leaves.map((leaf) => leaf?.href)).toEqual([
      `/(app)/(home)/device/${ID}`,
      `/(app)/(cameras)/cameras/${ID}`,
      `/(app)/(home)/rooms/${ID}`,
      `/(app)/(home)/groups/${ID}`,
      `/(app)/(automations)/automations/scenes/${ID}`,
      `/(app)/(automations)/automations/${ID}`,
    ]);
  });

  it('give two pins of the same kind different ids and one pin the same id each time', () => {
    const first = pinLeafOf({ kind: 'room', roomId: ID });
    expect(first?.id).toBe(pinLeafOf({ kind: 'room', roomId: ID })?.id);
    expect(first?.id).not.toBe(pinLeafOf({ kind: 'room', roomId: OTHER })?.id);
  });

  it('have no leaf for a section, which is a tab of its own', () => {
    expect(pinLeafOf({ kind: 'section', section: 'home' })).toBeNull();
  });

  it('host plugin pages and the sub-pages that live in a tab stack', () => {
    expect(pinLeafOf({ kind: 'page', path: 'plugin.acme.status' })?.params).toEqual({
      pluginId: 'acme',
      page: 'status',
    });
    expect(pinLeafOf({ kind: 'page', path: 'devices-air' })?.route).toBe('devices/air');
    expect(pinLeafOf({ kind: 'page', path: 'weather' })?.group).toBe('(home)');
  });

  it('read the singular id of a screen from its params, or none without them', () => {
    const device = LEAF_ROUTES.find((leaf) => leaf.route === 'device/[deviceId]/index');
    if (device === undefined) throw new Error('The device leaf is missing.');
    const idOf = singularIdOf(device);
    expect(idOf('device', { deviceId: ID })).toBe(ID);
    expect(idOf('device', {})).toBeUndefined();
  });

  it('only name routes that exist as files of the group that hosts them', () => {
    for (const leaf of LEAF_ROUTES) {
      const names = namesOfGroup(leaf.group);
      const expected = leaf.nested
        ? names
            .filter((name) => name.startsWith('automations/'))
            .map((name) => name.slice('automations/'.length))
        : names;
      expect(expected, `${leaf.group} ${leaf.route}`).toContain(leaf.route);
    }
    expect(leafRoutesOf('(cameras)').length).toBeGreaterThan(0);
  });

  it('are produced only for targets that can be pinned', () => {
    const target: NavPinTarget = { kind: 'room', roomId: ID };
    expect(pinnableTarget(target)).toBe(target);
    expect(navTargetKey(target)).toBe(`room:${ID}`);
  });
});
