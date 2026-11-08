import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { HEALTH_METRICS } from '../../src/api/rows-access';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import {
  HEALTH_KINDS,
  HEALTH_RANGE_DEFAULT_DAYS,
  HEALTH_WATER_UNIT_CHOICES,
} from '../../src/automation-nodes/health';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const IDS = ['health.today', 'health.range', 'health.log_water'] as const;

type HealthId = (typeof IDS)[number];

function kindOf(id: HealthId): (typeof HEALTH_KINDS)[number] | undefined {
  return NODE_REGISTRY.get(id);
}

function input(id: HealthId, name: string): InputPortDecl | undefined {
  return kindOf(id)?.inputs.find((port) => port.name === name);
}

function output(id: HealthId, name: string): unknown {
  return kindOf(id)?.outputs.find((port) => port.name === name);
}

function summary(id: HealthId, ports: Parameters<typeof renderSummary>[1]): string {
  return summaryText(renderSummary(kindOf(id)?.summary ?? '', ports));
}

describe('health kinds registration', () => {
  it('registers exactly the three kinds once each as valid people nodes', () => {
    expect(HEALTH_KINDS.map((each) => each.id)).toEqual([...IDS]);
    for (const id of IDS) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kindOf(id)?.category, id).toBe('people');
      const kind = kindOf(id);
      expect(kind === undefined ? ['missing'] : kindProblems(kind), id).toEqual([]);
    }
    expect(kindOf('health.today')?.class).toBe('read');
    expect(kindOf('health.range')?.class).toBe('read');
    expect(kindOf('health.log_water')?.class).toBe('effect');
  });

  it('leaves the existing health.read kind as stored programs wire it', () => {
    const kind = NODE_REGISTRY.get('health.read');
    expect(kind?.class).toBe('effect');
    expect(kind?.exits).toEqual(['next']);
  });

  it('uses only registered picker sources and no free-text input', () => {
    for (const id of IDS)
      for (const port of kindOf(id)?.inputs ?? []) {
        const source = port.ui?.optionsFrom;
        if (source !== undefined) expect(isOptionSourceId(source), `${id}.${port.name}`).toBe(true);
        expect(port.type.t, `${id}.${port.name}`).not.toBe('any');
      }
  });
});

describe('health.today', () => {
  it('takes a required person from the people picker', () => {
    expect(input('health.today', 'person')).toMatchObject({
      type: { t: 'ref', of: 'person' },
      required: true,
      summary: true,
      ui: { optionsFrom: 'people' },
    });
    expect(kindOf('health.today')?.inputs).toHaveLength(1);
  });

  it('reports steps, energy, sleep as a duration, water and the goals met', () => {
    expect(output('health.today', 'steps')).toMatchObject({
      type: { t: 'number' },
      optional: true,
    });
    expect(output('health.today', 'energy')).toMatchObject({
      type: { t: 'number', unit: 'kcal' },
      optional: true,
    });
    expect(output('health.today', 'sleep')).toMatchObject({
      type: { t: 'duration' },
      optional: true,
    });
    expect(output('health.today', 'water')).toMatchObject({
      type: { t: 'number', unit: 'ml' },
      optional: true,
    });
    expect(output('health.today', 'goalsMet')).toMatchObject({
      type: { t: 'number', integer: true },
    });
    expect(output('health.today', 'goalsTotal')).toMatchObject({
      type: { t: 'number', integer: true },
    });
    expect(output('health.today', 'day')).toMatchObject({ type: { t: 'date' } });
  });

  it('is a plain read without exec exits or an error exit', () => {
    const kind = kindOf('health.today');
    expect(kind?.exits).toEqual([]);
    expect(kind === undefined ? undefined : fallibleOf(kind, STATIC_KIND_LOOKUP)).toBe(false);
    expect(fallibleOf('health.range', STATIC_KIND_LOOKUP)).toBe(false);
    expect(summary('health.today', { person: { lit: { person: 'ann' } } })).toBe(
      'Today for {"person":"ann"}',
    );
  });
});

describe('health.range', () => {
  it('picks the figure from every health metric through the metrics source', () => {
    const metric = input('health.range', 'metric');
    expect(metric).toMatchObject({
      required: true,
      static: true,
      ui: { optionsFrom: 'health.metrics' },
    });
    expect(metric?.type).toEqual({
      t: 'choice',
      options: HEALTH_METRICS.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
    });
  });

  it('takes whole days from one up with no upper limit, a week by default', () => {
    const days = input('health.range', 'days');
    expect(days).toMatchObject({
      type: { t: 'number', integer: true, min: 1 },
      required: false,
      default: HEALTH_RANGE_DEFAULT_DAYS,
    });
    expect(days?.type).not.toHaveProperty('max');
    expect(days?.ui).not.toHaveProperty('max');
    expect(HEALTH_RANGE_DEFAULT_DAYS).toBe(7);
  });

  it('lists the values and dates oldest first with the average, count and unit', () => {
    expect(output('health.range', 'values')).toMatchObject({
      type: { t: 'list', of: { t: 'number' } },
    });
    expect(output('health.range', 'dates')).toMatchObject({
      type: { t: 'list', of: { t: 'date' } },
    });
    expect(output('health.range', 'average')).toMatchObject({
      type: { t: 'number' },
      optional: true,
    });
    expect(output('health.range', 'count')).toMatchObject({
      type: { t: 'number', integer: true },
    });
    expect(output('health.range', 'unit')).toMatchObject({ type: { t: 'text' } });
  });

  it('summarises in plain words and shows unset values as absent', () => {
    expect(summary('health.range', { metric: { lit: 'steps' }, days: { lit: 3 } })).toBe(
      'steps of … over 3 days',
    );
  });
});

describe('health.log_water', () => {
  it('takes an optional person, a required amount and a millilitres or glasses unit', () => {
    expect(input('health.log_water', 'person')).toMatchObject({
      type: { t: 'ref', of: 'person' },
      required: false,
      ui: { optionsFrom: 'people' },
    });
    expect(input('health.log_water', 'amount')).toMatchObject({
      type: { t: 'number' },
      required: true,
      summary: true,
    });
    expect(input('health.log_water', 'unit')).toMatchObject({
      type: { t: 'choice', options: [...HEALTH_WATER_UNIT_CHOICES] },
      required: false,
      default: 'millilitres',
      static: true,
    });
    expect(HEALTH_WATER_UNIT_CHOICES.map((choice) => choice.id)).toEqual([
      'millilitres',
      'glasses',
    ]);
  });

  it('gives the added and total millilitres and has the error exit', () => {
    expect(output('health.log_water', 'added')).toMatchObject({
      type: { t: 'number', unit: 'ml' },
    });
    expect(output('health.log_water', 'total')).toMatchObject({
      type: { t: 'number', unit: 'ml' },
    });
    expect(kindOf('health.log_water')?.outputs).toContainEqual(ERROR_OUT);
    const kind = kindOf('health.log_water');
    expect(kind === undefined ? undefined : fallibleOf(kind, STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('health.log_water', STATIC_KIND_LOOKUP)).toBe(true);
    const wired = execPortsOf(
      'health.log_water',
      {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'water',
        kind: 'health.log_water',
        to: { onError: '00000000-0000-4000-8000-000000000002' },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(wired.outputs.map((each) => each.port)).toContain('onError');
    expect(
      execPortsOf('health.log_water', undefined, STATIC_KIND_LOOKUP).outputs.map(
        (each) => each.port,
      ),
    ).not.toContain('onError');
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
  });

  it('always waits for the result because it returns the total, and never repeats blindly', () => {
    const kind = kindOf('health.log_water');
    expect(hasModeChoice(kind)).toBe(false);
    expect(runModeOf(kind, 'fire_and_forget')).toBe('wait_for_result');
    expect(kind?.effect).toEqual({ retry: 'relative', budget: 'effects' });
  });

  it('summarises with the amount and unit', () => {
    expect(summary('health.log_water', { amount: { lit: 2 }, unit: { lit: 'glasses' } })).toBe(
      'Log 2 glasses of water for …',
    );
  });
});
