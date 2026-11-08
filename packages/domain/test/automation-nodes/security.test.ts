import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { COVER_ACTION_CHOICES, SECURITY_KINDS } from '../../src/automation-nodes/security';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const IDS = ['lock.set', 'alarm.set', 'cover.set'] as const;

function kindOf(id: (typeof IDS)[number]): ReturnType<typeof NODE_REGISTRY.get> {
  return NODE_REGISTRY.get(id);
}

function input(id: (typeof IDS)[number], name: string): InputPortDecl | undefined {
  return kindOf(id)?.inputs.find((port) => port.name === name);
}

describe('lock, alarm and cover registration', () => {
  it('registers three unique action kinds that pass the registry checks', () => {
    expect(SECURITY_KINDS.map((each) => each.id)).toEqual([...IDS]);
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kind?.class, id).toBe('effect');
      expect(kind?.category, id).toBe('devices');
      expect(kind === undefined ? ['missing'] : kindProblems(kind), id).toEqual([]);
    }
  });

  it('declares the target, the setting ports and the sent, skipped and error outputs', () => {
    expect(kindOf('lock.set')?.inputs.map((port) => port.name)).toEqual(['target', 'locked']);
    expect(kindOf('alarm.set')?.inputs.map((port) => port.name)).toEqual(['target', 'mode']);
    expect(kindOf('cover.set')?.inputs.map((port) => port.name)).toEqual([
      'target',
      'action',
      'position',
    ]);
    for (const id of IDS) {
      expect(
        kindOf(id)?.outputs.map((port) => port.name),
        id,
      ).toEqual(['sent', 'skipped', 'error']);
      expect(kindOf(id)?.exits, id).toEqual(['next']);
    }
  });
});

describe('typed ports with pickers', () => {
  it('takes a required target that accepts a device, a room, a group or a list', () => {
    for (const id of IDS)
      expect(input(id, 'target'), id).toMatchObject({
        type: { t: 'ref', of: 'target' },
        required: true,
        summary: true,
      });
  });

  it('locks by default with a plain on and off boolean', () => {
    expect(input('lock.set', 'locked')).toMatchObject({
      type: { t: 'boolean' },
      required: false,
      default: true,
    });
  });

  it('picks the alarm mode from the modes the picked device offers', () => {
    expect(input('alarm.set', 'mode')).toMatchObject({
      type: { t: 'text' },
      required: true,
      ui: { optionsFrom: 'device.enum_values' },
    });
  });

  it('chooses open, close, stop or a position and takes a position in percent', () => {
    expect(COVER_ACTION_CHOICES.map((choice) => choice.id)).toEqual([
      'open',
      'close',
      'stop',
      'position',
    ]);
    expect(input('cover.set', 'action')).toMatchObject({
      type: { t: 'choice', options: [...COVER_ACTION_CHOICES] },
      default: 'open',
    });
    expect(input('cover.set', 'position')).toMatchObject({
      type: { t: 'number' },
      required: false,
      ui: { min: 0, max: 100, unit: '%' },
    });
  });

  it('has no any or raw record input and every picker and editor is a known id', () => {
    for (const id of IDS)
      for (const port of kindOf(id)?.inputs ?? []) {
        expect(port.type.t, `${id} ${port.name}`).not.toBe('any');
        expect(port.type.t, `${id} ${port.name}`).not.toBe('record');
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom)).toBe(true);
        if (port.ui?.editor !== undefined) expect(isPortEditorId(port.ui.editor)).toBe(true);
        expect(port.required && port.default !== undefined, `${id} ${port.name}`).toBe(false);
      }
  });

  it('summarises in plain words', () => {
    expect(
      summaryText(renderSummary(kindOf('lock.set')?.summary ?? '', { locked: { lit: false } })),
    ).toBe('Set … locked to false');
    expect(
      summaryText(renderSummary(kindOf('alarm.set')?.summary ?? '', { mode: { lit: 'away' } })),
    ).toBe('Set alarm of … to away');
  });
});

describe('access', () => {
  it('lets only the owner use the lock node', () => {
    expect(kindOf('lock.set')?.access).toBe('owner');
  });

  it('leaves the alarm and cover nodes to every member', () => {
    expect(kindOf('alarm.set')?.access).toBe('member');
    expect(kindOf('cover.set')?.access).toBe('member');
  });
});

describe('run mode and error exit', () => {
  it('sends by default and may wait for the devices to confirm', () => {
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('is fallible, carries the shared error output and can route its failure', () => {
    for (const id of IDS) {
      expect(fallibleOf(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(kindOf(id)?.outputs.at(-1), id).toBe(ERROR_OUT);
      const wired = execPortsOf(
        id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          key: 'node',
          kind: id,
          to: { onError: '00000000-0000-4000-8000-000000000002' },
        },
        STATIC_KIND_LOOKUP,
      );
      expect(
        wired.outputs.map((out) => out.port),
        id,
      ).toContain('onError');
      expect(
        execPortsOf(id, undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
        id,
      ).not.toContain('onError');
    }
  });
});
