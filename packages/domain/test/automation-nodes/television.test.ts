import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';
import {
  TELEVISION_KINDS,
  TV_ACTION_CHOICES,
  TV_PLAYBACK_CHOICES,
} from '../../src/automation-nodes/television';

const kind = NODE_REGISTRY.get('tv.control');

function input(name: string): InputPortDecl | undefined {
  return kind?.inputs.find((port) => port.name === name);
}

describe('tv.control registration', () => {
  it('is registered once as a valid devices effect', () => {
    expect(TELEVISION_KINDS.map((each) => each.id)).toEqual(['tv.control']);
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'tv.control')).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('devices');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('offers every action the objective names', () => {
    expect(TV_ACTION_CHOICES.map((choice) => choice.id)).toEqual([
      'power_on',
      'power_off',
      'volume_set',
      'volume_up',
      'volume_down',
      'mute',
      'unmute',
      'input',
      'channel',
      'open_app',
      'press_key',
      'art_mode_on',
      'art_mode_off',
      'playback',
      'picture_mode',
      'sound_mode',
    ]);
    expect(TV_PLAYBACK_CHOICES.map((choice) => choice.id)).toEqual([
      'play',
      'pause',
      'stop',
      'fast_forward',
      'rewind',
    ]);
  });
});

describe('tv.control ports are typed with pickers', () => {
  it('takes one required TV device and a required action choice', () => {
    expect(input('tv')).toMatchObject({
      type: { t: 'ref', of: 'device', families: ['television'] },
      required: true,
      summary: true,
    });
    expect(input('action')).toMatchObject({
      type: { t: 'choice' },
      required: true,
      static: true,
    });
  });

  it('picks inputs, apps and remote buttons from the TV sources', () => {
    expect(input('input')?.ui?.optionsFrom).toBe('tv.inputs');
    expect(input('app')?.ui?.optionsFrom).toBe('tv.apps');
    expect(input('key')?.ui?.optionsFrom).toBe('tv.keys');
  });

  it('picks picture and sound modes from the values the TV accepts', () => {
    expect(input('pictureMode')?.ui?.optionsFrom).toBe('tv.picture_modes');
    expect(input('soundMode')?.ui?.optionsFrom).toBe('tv.sound_modes');
  });

  it('types volume and channel as numbers, with the volume range declared on the port', () => {
    expect(input('volume')).toMatchObject({
      type: { t: 'number' },
      live: true,
      ui: { min: 0, max: 100, unit: '%' },
    });
    expect(input('channel')).toMatchObject({ type: { t: 'number' }, live: true });
  });

  it('has no raw JSON, record or untyped input and only known picker sources', () => {
    for (const port of kind?.inputs ?? []) {
      expect(['any', 'record'], port.name).not.toContain(port.type.t);
      expect(port.required && port.default !== undefined, port.name).toBe(false);
      if (port.ui?.optionsFrom !== undefined)
        expect(isOptionSourceId(port.ui.optionsFrom), port.name).toBe(true);
    }
  });

  it('summarises in plain words and shows unset values as absent', () => {
    expect(summaryText(renderSummary(kind?.summary ?? '', { action: { lit: 'power_on' } }))).toBe(
      'Tell … to power_on',
    );
  });
});

describe('tv.control run mode and error exit', () => {
  it('sends by default and may wait for the TV to confirm', () => {
    expect(kind?.effect).toEqual({ retry: 'relative', budget: 'command', mode: 'fire_and_forget' });
    expect(modesOf(kind)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(hasModeChoice(kind)).toBe(true);
    expect(runModeOf(kind, undefined)).toBe('fire_and_forget');
    expect(runModeOf(kind, 'wait_for_result')).toBe('wait_for_result');
  });

  it('is fallible, carries the shared error output and can route its failure', () => {
    expect(fallibleOf('tv.control', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('tv.control', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
    const wired = execPortsOf(
      'tv.control',
      {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'tv',
        kind: 'tv.control',
        to: { onError: '00000000-0000-4000-8000-000000000002' },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(wired.outputs.map((out) => out.port)).toContain('onError');
    expect(
      execPortsOf('tv.control', undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
    ).not.toContain('onError');
  });
});
