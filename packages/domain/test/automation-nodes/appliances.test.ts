import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import { APPLIANCE_KINDS } from '../../src/automation-nodes/appliances';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const IDS = ['appliance.set', 'device.action'] as const;

function kindOf(id: (typeof IDS)[number]): (typeof APPLIANCE_KINDS)[number] | undefined {
  return NODE_REGISTRY.get(id);
}

function input(id: (typeof IDS)[number], name: string): InputPortDecl | undefined {
  return kindOf(id)?.inputs.find((port) => port.name === name);
}

describe('appliance kinds registration', () => {
  it('registers exactly the two kinds once each as valid devices effects', () => {
    expect(APPLIANCE_KINDS.map((each) => each.id)).toEqual([...IDS]);
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

  it('declares the ports the objective names', () => {
    expect(kindOf('appliance.set')?.inputs.map((port) => port.name)).toEqual([
      'target',
      'setting',
      'value',
      'requireAll',
    ]);
    expect(kindOf('appliance.set')?.outputs.map((port) => port.name)).toEqual([
      'ok',
      'sent',
      'skipped',
      'value',
      'error',
    ]);
    expect(kindOf('device.action')?.inputs.map((port) => port.name)).toEqual([
      'target',
      'action',
      'requireAll',
    ]);
    expect(kindOf('device.action')?.outputs.map((port) => port.name)).toEqual([
      'ok',
      'sent',
      'skipped',
      'error',
    ]);
  });
});

describe('appliance ports are typed with pickers', () => {
  it('takes a required target that accepts devices, rooms and groups', () => {
    for (const id of IDS)
      expect(input(id, 'target'), id).toMatchObject({
        type: { t: 'ref', of: 'target' },
        required: true,
        summary: true,
      });
  });

  it('picks the setting only from controls that can be set', () => {
    expect(input('appliance.set', 'setting')).toMatchObject({
      type: { t: 'text' },
      required: true,
      static: true,
      ui: { optionsFrom: 'device.writable_controls' },
    });
  });

  it('types the value by the chosen setting and has no other generic input', () => {
    expect(input('appliance.set', 'value')).toMatchObject({
      type: { t: 'any' },
      required: true,
      live: true,
      ui: { typedBy: 'setting' },
    });
    const generic = ALL_NODE_KINDS.filter((each) => IDS.some((id) => id === each.id)).flatMap(
      (each) =>
        each.inputs
          .filter((port) => port.type.t === 'any' || port.type.t === 'record')
          .map((port) => `${each.id}.${port.name}`),
    );
    expect(generic).toEqual(['appliance.set.value']);
  });

  it('picks the action only from action controls and has no value or JSON port', () => {
    expect(input('device.action', 'action')).toMatchObject({
      type: { t: 'text' },
      required: true,
      static: true,
      ui: { optionsFrom: 'device.actions' },
    });
    const names = kindOf('device.action')?.inputs.map((port) => port.name) ?? [];
    expect(names).not.toContain('to');
    expect(names).not.toContain('value');
  });

  it('knows every picker and editor id and never combines a default with required', () => {
    for (const id of IDS)
      for (const port of kindOf(id)?.inputs ?? []) {
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id}.${port.name}`).toBe(true);
        if (port.ui?.editor !== undefined)
          expect(isPortEditorId(port.ui.editor), `${id}.${port.name}`).toBe(true);
        expect(port.required && port.default !== undefined, `${id}.${port.name}`).toBe(false);
      }
  });

  it('summarises in plain words and shows unset values as absent', () => {
    expect(
      summaryText(
        renderSummary(kindOf('appliance.set')?.summary ?? '', {
          setting: { lit: 'purifier_mode' },
          value: { lit: 'sleep' },
        }),
      ),
    ).toBe('Set purifier_mode of … to sleep');
    expect(summaryText(renderSummary(kindOf('device.action')?.summary ?? '', {}))).toBe(
      'Run … on …',
    );
  });
});

describe('appliance run mode and error exit', () => {
  it('sends by default and may wait for the device to confirm', () => {
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(kind?.effect?.mode, id).toBe('fire_and_forget');
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('never retries an action automatically because pressing it twice is not the same', () => {
    expect(kindOf('device.action')?.effect?.retry).toBe('relative');
    expect(kindOf('appliance.set')?.effect?.retry).toBe('idempotent');
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
          key: 'appliance',
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
