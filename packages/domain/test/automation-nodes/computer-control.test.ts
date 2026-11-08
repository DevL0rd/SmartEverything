import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  COMPUTER_CONTROL_KINDS,
  PROCESS_ACTION_CHOICES,
  PROCESS_ACTION_IDS,
  PROCESS_PRIORITY_CHOICES,
} from '../../src/automation-nodes/computer-control';
import { COMPUTER_READ_CAPABILITIES } from '../../src/automation-nodes/computers-phones';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf } from '../../src/automation-nodes/run-modes';
import { COMPUTER_CAPABILITY_CATALOGUE } from '../../src/computer-capabilities';
import { PROCESS_PRIORITIES, PROCESS_SIGNALS } from '../../src/node/computer-processes';

const IDS = ['computer.keys', 'computer.process', 'computer.windows'] as const;

function input(kindId: string, name: string): InputPortDecl | undefined {
  return NODE_REGISTRY.get(kindId)?.inputs.find((port) => port.name === name);
}

function output(kindId: string, name: string): unknown {
  return NODE_REGISTRY.get(kindId)?.outputs.find((port) => port.name === name);
}

describe('computer keys, programs and windows registration', () => {
  it.each(IDS)('%s is registered once as a valid computers action', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(COMPUTER_CONTROL_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(ALL_NODE_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('computers');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it.each(IDS)('%s has the error exit', (id) => {
    expect(NODE_REGISTRY.get(id)?.outputs.at(-1)).toBe(ERROR_OUT);
    expect(fallibleOf(id, STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError(id, STATIC_KIND_LOOKUP)).toBe(true);
  });
});

describe('computer.keys', () => {
  it('sends by default and can wait', () => {
    expect(modesOf(NODE_REGISTRY.get('computer.keys'))).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
  });

  it('takes a key combination from the key editor or a text, and no pointer position', () => {
    expect(input('computer.keys', 'keys')?.ui?.editor).toBe('key-combo');
    expect(input('computer.keys', 'keys')?.type).toEqual({ t: 'text' });
    expect(input('computer.keys', 'text')?.type).toEqual({ t: 'text' });
    const names = NODE_REGISTRY.get('computer.keys')?.inputs.map((port) => port.name);
    expect(names).toEqual(['computer', 'keys', 'text']);
  });
});

describe('computer.process', () => {
  it('offers every signal of process_control and the priority change', () => {
    const type = input('computer.process', 'action')?.type;
    const ids = type?.t === 'choice' ? type.options.map((option) => option.id) : [];
    expect(ids).toEqual([...PROCESS_SIGNALS, 'priority']);
    expect(PROCESS_ACTION_IDS).toEqual(ids);
    expect(PROCESS_ACTION_CHOICES.map((choice) => choice.id)).toEqual(ids);
    expect(input('computer.process', 'action')?.required).toBe(true);
  });

  it('picks the programs from what runs on the computer, several at once', () => {
    const programs = input('computer.process', 'process');
    expect(programs?.ui?.optionsFrom).toBe('computer.processes');
    expect(programs?.ui?.multiple).toBe(true);
    expect(programs?.required).toBe(true);
    expect(isOptionSourceId(programs?.ui?.optionsFrom ?? '')).toBe(true);
  });

  it('offers the priorities the tool documents', () => {
    const type = input('computer.process', 'priority')?.type;
    const ids = type?.t === 'choice' ? type.options.map((option) => option.id) : [];
    expect(ids).toEqual(PROCESS_PRIORITIES);
    expect(PROCESS_PRIORITY_CHOICES.map((choice) => choice.id)).toEqual(PROCESS_PRIORITIES);
  });

  it('reports how many programs it reached and always waits for that', () => {
    expect(output('computer.process', 'ended')).toMatchObject({
      type: { t: 'number', integer: true, min: 0 },
    });
    const kind = NODE_REGISTRY.get('computer.process');
    expect(modesOf(kind)).toEqual({ default: 'wait_for_result', allowed: ['wait_for_result'] });
    expect(hasModeChoice(kind)).toBe(false);
  });
});

describe('computer.windows', () => {
  it('reads the apps with a window and the app in front, and always waits', () => {
    expect(output('computer.windows', 'apps')).toMatchObject({
      type: { t: 'list', of: { t: 'text' } },
    });
    expect(output('computer.windows', 'focused')).toMatchObject({ optional: true });
    expect(hasModeChoice(NODE_REGISTRY.get('computer.windows'))).toBe(false);
  });
});

describe('computer.read outputs', () => {
  const kind = NODE_REGISTRY.get('computer.read');
  const names = kind?.outputs.map((port) => port.name) ?? [];

  it('keeps every earlier output and adds the new readings', () => {
    for (const wanted of [
      'locked',
      'focusedApp',
      'signedInUser',
      'charging',
      'batteryLevel',
      'cpuLoad',
      'gpuLoad',
      'downloadRate',
      'uploadRate',
      'memoryUsed',
      'diskUsed',
      'cpuTemperature',
      'gpuTemperature',
      'cpuPower',
      'gpuPower',
      'audioOutput',
      'micMuted',
      'powerMode',
      'displaysOn',
    ]) {
      expect(names).toContain(wanted);
    }
  });

  it('leaves out a figure the computer does not report', () => {
    expect(kind?.outputs.every((port) => port.optional === true)).toBe(true);
  });

  it('maps every output to a computer capability and every capability exists', () => {
    expect(Object.keys(COMPUTER_READ_CAPABILITIES).sort()).toEqual([...names].sort());
    for (const capability of Object.values(COMPUTER_READ_CAPABILITIES)) {
      expect(Object.keys(COMPUTER_CAPABILITY_CATALOGUE)).toContain(capability);
    }
    expect(new Set(Object.values(COMPUTER_READ_CAPABILITIES)).size).toBe(names.length);
  });

  it('types the new readings with their units', () => {
    expect(output('computer.read', 'memoryUsed')).toMatchObject({ type: { unit: '%' } });
    expect(output('computer.read', 'cpuTemperature')).toMatchObject({ type: { unit: '°C' } });
    expect(output('computer.read', 'gpuPower')).toMatchObject({ type: { unit: 'W' } });
    expect(output('computer.read', 'micMuted')).toMatchObject({ type: { t: 'boolean' } });
    expect(output('computer.read', 'displaysOn')).toMatchObject({
      type: { t: 'number', integer: true },
    });
  });
});
