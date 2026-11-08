import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CLASSES,
  ERROR_EXIT_OUTPUTS,
  ERROR_EXIT_PORT,
  NODE_REGISTRY,
  OPTION_SOURCE_IDS,
  canRouteOnError,
  modesOf,
} from '@smarteverything/domain';
import { repositoryRoot } from './repository-files';

const SKILL = readFileSync(
  join(repositoryRoot, 'packages/harness/skills/smarteverything-automation-nodes/SKILL.md'),
  'utf8',
);

const DOTTED_ID = /`([a-z]+(?:\.[a-z_]+)+)`/gu;

const PLUGIN_ID_SHAPES: readonly string[] = ['trigger.plugin.<owner>.<id>'];

const FIRST_CLASS: readonly string[] = [
  'light.set',
  'climate.set',
  'appliance.set',
  'device.action',
  'ir.appliance_set',
  'laundry.start',
  'laundry.control',
  'laundry.read',
  'lock.set',
  'alarm.set',
  'cover.set',
  'camera.snapshot',
  'camera.record',
  'camera.move',
  'camera.set',
  'notify.speak',
  'vacuum.command',
  'vacuum.station',
  'vacuum.clean_rooms',
  'vacuum.read',
  'tv.control',
  'call.person',
  'call.open',
  'call.end',
  'computer.audio',
  'computer.display',
  'computer.power',
  'computer.system',
  'computer.app',
  'computer.open',
  'phone.ring',
  'phone.sound',
  'phone.media',
  'phone.open',
  'phone.flashlight',
  'phone.screen',
  'phone.toggle',
  'ai.image',
  'ai.vision',
  'chat.post',
  'transcript.read',
  'listening.set',
  'health.today',
  'health.range',
  'event.count',
  'device.query',
];

function dottedIds(): readonly string[] {
  return [...SKILL.matchAll(DOTTED_ID)].map((match) => match[1] ?? '');
}

function isKnown(id: string): boolean {
  return NODE_REGISTRY.has(id) || OPTION_SOURCE_IDS.some((source) => source === id);
}

describe('the automation nodes skill', () => {
  it('names only node kinds and picker sources that exist', () => {
    const unknown = dottedIds().filter(
      (id) =>
        !isKnown(id) &&
        !PLUGIN_ID_SHAPES.includes(id) &&
        !/^(?:plugin|policy|modes|trigger)\./u.test(id),
    );
    expect(unknown).toEqual([]);
  });

  it('teaches every first-class node it lists, each present in the registry', () => {
    for (const id of FIRST_CLASS) {
      expect(NODE_REGISTRY.has(id), id).toBe(true);
      expect(SKILL, id).toContain(`\`${id}\``);
    }
  });

  it('sends speech through notify.speak and display settings through computer.display', () => {
    expect(SKILL).toContain('never `tool.call` with `voice_speak`');
    expect(SKILL).not.toContain('"target":{"kind":"device"');
    expect(SKILL).toContain('Display settings are always `computer.display`');
    expect(SKILL).not.toMatch(/stay with a `tool\.call`/u);
  });

  it('names the error exit port, its three values and the error classes it can carry', () => {
    expect(SKILL).toContain(`\`${ERROR_EXIT_PORT}\``);
    for (const output of ERROR_EXIT_OUTPUTS) expect(SKILL, output.name).toContain(output.name);
    const named = ['Timeout', 'Refused', 'Unreachable', 'Invalid', 'NotFound', 'Forbidden'];
    for (const reason of named) expect(ERROR_CLASSES, reason).toContain(reason);
    for (const reason of named) expect(SKILL, reason).toContain(reason);
  });

  it('teaches run modes only for kinds that offer a choice and the error exit for fallible ones', () => {
    const speak = NODE_REGISTRY.get('notify.speak');
    const light = NODE_REGISTRY.get('light.set');
    expect(modesOf(speak).allowed).toHaveLength(2);
    expect(modesOf(light).allowed).toHaveLength(2);
    expect(canRouteOnError('light.set', NODE_REGISTRY)).toBe(true);
    expect(SKILL).toContain('fire_and_forget');
    expect(SKILL).toContain('wait_for_result');
    expect(SKILL).toContain('waitOnly');
  });

  it('points plugin nodes at the plugins group and never at tool.call', () => {
    expect(SKILL).toContain('`plugins`');
    expect(SKILL).toMatch(/Never use `tool\.call` for something a plugin node does/u);
  });
});
