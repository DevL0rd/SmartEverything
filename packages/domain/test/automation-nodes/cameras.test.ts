import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { HUB_COMMAND } from '../../src/hub-commands';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  CAMERA_DIRECTION_CHOICES,
  CAMERA_KINDS,
  CAMERA_SWITCH_CHOICES,
  CLIP_SECONDS_DEFAULT,
  CLIP_SECONDS_MAX,
  CLIP_SECONDS_MIN,
} from '../../src/automation-nodes/cameras';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const move = NODE_REGISTRY.get('camera.move');
const set = NODE_REGISTRY.get('camera.set');
const record = NODE_REGISTRY.get('camera.record');
const snapshot = NODE_REGISTRY.get('camera.snapshot');

function input(kind: typeof move, name: string): InputPortDecl | undefined {
  return kind?.inputs.find((port) => port.name === name);
}

describe('camera.move and camera.set registration', () => {
  it('registers three action kinds once each, keeping the camera picture kind', () => {
    expect(CAMERA_KINDS.map((each) => each.id)).toEqual([
      'camera.move',
      'camera.set',
      'camera.record',
    ]);
    for (const id of ['camera.move', 'camera.set', 'camera.record', 'camera.snapshot']) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
    }
    for (const kind of [move, set, record]) {
      expect(kind?.class).toBe('effect');
      expect(kind?.category).toBe('cameras');
      expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
    }
  });

  it('leaves the camera picture kind with its single image output and adds the list', () => {
    const snapshot = NODE_REGISTRY.get('camera.snapshot');
    expect(snapshot?.outputs.map((port) => port.name)).toEqual([
      'image',
      'at',
      'images',
      'cameras',
      'skipped',
      'error',
    ]);
    expect(snapshot?.outputs.find((port) => port.name === 'image')).toMatchObject({
      type: { t: 'text' },
    });
    expect(snapshot?.outputs.find((port) => port.name === 'image')?.optional).toBeUndefined();
    expect(snapshot?.outputs.find((port) => port.name === 'images')).toMatchObject({
      type: { t: 'list', of: { t: 'text' } },
      optional: true,
    });
  });
});

describe('camera.move ports', () => {
  it('takes one camera, a saved position or a direction, and steps', () => {
    expect(move?.inputs.map((port) => port.name)).toEqual([
      'camera',
      'preset',
      'direction',
      'steps',
    ]);
    expect(input(move, 'camera')).toMatchObject({
      type: { t: 'ref', of: 'camera' },
      required: true,
      summary: true,
    });
  });

  it('picks the saved position from the camera presets and the direction from four choices', () => {
    expect(input(move, 'preset')?.ui).toMatchObject({ optionsFrom: 'camera.presets' });
    expect(input(move, 'preset')?.required).toBe(false);
    expect(CAMERA_DIRECTION_CHOICES.map((choice) => choice.id)).toEqual([
      'left',
      'right',
      'up',
      'down',
    ]);
    expect(input(move, 'direction')).toMatchObject({
      type: { t: 'choice', options: [...CAMERA_DIRECTION_CHOICES] },
      required: false,
    });
  });

  it('counts whole steps from one with no upper limit', () => {
    expect(input(move, 'steps')?.type).toEqual({ t: 'number', integer: true, min: 1 });
    expect(input(move, 'steps')?.type).not.toHaveProperty('max');
    expect(input(move, 'steps')?.default).toBe(1);
  });

  it('summarises in plain words', () => {
    const parts = renderSummary(move?.summary ?? '', { direction: { lit: 'left' } });
    expect(summaryText(parts)).toBe('Move …: … left');
  });
});

describe('camera.set ports', () => {
  it('declares the target, every camera, privacy, motion, night vision and status light', () => {
    expect(set?.inputs.map((port) => port.name)).toEqual([
      'target',
      'everyCamera',
      'privacy',
      'motionDetection',
      'nightVision',
      'statusLight',
    ]);
    expect(set?.outputs.map((port) => port.name)).toEqual(['sent', 'skipped', 'error']);
  });

  it('takes devices, rooms and groups as a target, or every camera, neither required alone', () => {
    expect(input(set, 'target')).toMatchObject({
      type: { t: 'ref', of: 'target' },
      required: false,
      summary: true,
    });
    expect(input(set, 'everyCamera')).toMatchObject({
      type: { t: 'boolean' },
      required: false,
      default: false,
    });
  });

  it('chooses privacy, motion detection and the status light from on, off and keep', () => {
    expect(CAMERA_SWITCH_CHOICES.map((choice) => choice.id)).toEqual(['on', 'off', 'keep']);
    for (const name of ['privacy', 'motionDetection', 'statusLight']) {
      expect(input(set, name), name).toMatchObject({
        type: { t: 'choice', options: [...CAMERA_SWITCH_CHOICES] },
        required: false,
        default: 'keep',
      });
    }
  });

  it('picks night vision from what the camera offers', () => {
    expect(input(set, 'nightVision')?.ui).toMatchObject({ optionsFrom: 'camera.night_vision' });
  });
});

describe('camera.record ports', () => {
  it('takes a camera and a number of seconds the hub accepts', () => {
    expect(record?.inputs.map((port) => port.name)).toEqual(['camera', 'seconds']);
    expect(input(record, 'camera')).toMatchObject({
      type: { t: 'ref', of: 'camera' },
      required: true,
      summary: true,
    });
    expect(input(record, 'seconds')).toMatchObject({
      type: { t: 'number', integer: true, min: 5, max: 300, unit: 's' },
      required: false,
      default: 30,
      ui: { min: 5, max: 300, unit: 's' },
    });
  });

  it('keeps the seconds range equal to what the hub clip command accepts', () => {
    const accepts = (seconds: number): boolean =>
      HUB_COMMAND.safeParse({
        capability: 'hub:record_clip',
        value: { deviceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', seconds },
      }).success;
    expect([CLIP_SECONDS_MIN, CLIP_SECONDS_MAX, CLIP_SECONDS_DEFAULT].every(accepts)).toBe(true);
    expect(accepts(CLIP_SECONDS_MIN - 1)).toBe(false);
    expect(accepts(CLIP_SECONDS_MAX + 1)).toBe(false);
  });

  it('gives the clip id and start time only when waiting, and the shared error output', () => {
    expect(record?.outputs.map((port) => port.name)).toEqual(['recordingId', 'at', 'error']);
    expect(record?.outputs.find((port) => port.name === 'recordingId')).toMatchObject({
      type: { t: 'text' },
      optional: true,
    });
    expect(record?.outputs.find((port) => port.name === 'at')).toMatchObject({
      type: { t: 'instant' },
      optional: true,
    });
    expect(record?.outputs.at(-1)).toBe(ERROR_OUT);
  });

  it('sends by default, may wait, is fallible and can route the failure', () => {
    expect(modesOf(record)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(runModeOf(record, 'wait_for_result')).toBe('wait_for_result');
    expect(fallibleOf('camera.record', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('camera.record', STATIC_KIND_LOOKUP)).toBe(true);
    expect(record?.effect).toMatchObject({ budget: 'command' });
  });
});

describe('camera.snapshot ports', () => {
  it('takes one camera or several cameras, a room or a group, neither required alone', () => {
    expect(snapshot?.inputs.map((port) => port.name)).toEqual(['camera', 'target', 'size']);
    expect(input(snapshot, 'camera')).toMatchObject({
      type: { t: 'ref', of: 'camera' },
      required: false,
    });
    expect(input(snapshot, 'target')).toMatchObject({
      type: { t: 'ref', of: 'target' },
      required: false,
    });
  });

  it('stays fallible with the shared error output and keeps its effect budget', () => {
    expect(snapshot?.outputs.at(-1)).toBe(ERROR_OUT);
    expect(canRouteOnError('camera.snapshot', STATIC_KIND_LOOKUP)).toBe(true);
    expect(snapshot?.effect).toEqual({ retry: 'idempotent', budget: 'effects' });
    expect(snapshot === undefined ? ['missing'] : kindProblems(snapshot)).toEqual([]);
  });
});

describe('the camera kinds have typed ports with known pickers', () => {
  it('has no any or raw record input and every picker and editor is a known id', () => {
    for (const kind of [move, set, record, snapshot]) {
      for (const port of kind?.inputs ?? []) {
        expect(port.type.t, port.name).not.toBe('any');
        expect(port.type.t, port.name).not.toBe('record');
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), port.name).toBe(true);
        if (port.ui?.editor !== undefined) expect(isPortEditorId(port.ui.editor)).toBe(true);
        expect(port.required && port.default !== undefined, port.name).toBe(false);
      }
    }
  });
});

describe('run mode and error exit', () => {
  it('send by default and may wait for the camera to confirm', () => {
    for (const kind of [move, set]) {
      expect(kind?.effect?.mode).toBe('fire_and_forget');
      expect(modesOf(kind)).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind)).toBe(true);
      expect(runModeOf(kind, undefined)).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result')).toBe('wait_for_result');
    }
  });

  it('are fallible, carry the shared error output and can route the failure', () => {
    for (const id of ['camera.move', 'camera.set', 'camera.record']) {
      expect(fallibleOf(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(NODE_REGISTRY.get(id)?.outputs.at(-1)).toBe(ERROR_OUT);
      const wired = execPortsOf(
        id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          key: 'camera',
          kind: id,
          to: { onError: '00000000-0000-4000-8000-000000000002' },
        },
        STATIC_KIND_LOOKUP,
      );
      expect(wired.outputs.map((out) => out.port)).toContain('onError');
      expect(
        execPortsOf(id, undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
      ).not.toContain('onError');
    }
  });
});
