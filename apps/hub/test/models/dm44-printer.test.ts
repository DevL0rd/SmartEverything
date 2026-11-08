import { MODEL_SPEC, identityScore, supplyCapabilityKey } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '@smarteverything/models';
import { admitEntry, entryFromSpec } from '../../src/models/contributions';
import {
  BROTHER_DCP_T430W_MODEL as PRINTER,
  PRINTER_MODEL_MATCH,
  PRINTER_MODELS,
} from '../../src/plugins/builtin/printer/models';

function channel(id: string): NonNullable<typeof PRINTER.channels>[number] {
  const found = PRINTER.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

describe('the Brother DCP-T430W model', () => {
  it('parses strictly and passes every authoring check with its supply capabilities', () => {
    expect(PRINTER_MODELS).toStrictEqual([PRINTER]);
    expect(MODEL_SPEC.safeParse(PRINTER).success).toBe(true);
    expect(checkAuthoring(PRINTER, { capabilitySources: true }).problems).toStrictEqual([]);
  });

  it('keeps the published 390 by 343 by 148.5 mm size', () => {
    expect(PRINTER.footprint).toStrictEqual({ width: 0.39, depth: 0.343, height: 0.1485 });
  });

  it('fills each of the four ink tanks from its own supply level', () => {
    for (const key of ['black', 'cyan', 'magenta', 'yellow']) {
      const level = channel(`${key}Level`);
      expect(level.source).toStrictEqual({ capability: supplyCapabilityKey(key) });
      expect(level).toMatchObject({ target: `${key}Floor`, property: 'scale', axis: 'y' });
      expect(level.map).toMatchObject({ type: 'linear', in: [0, 100] });
    }
  });

  it('lights the ink warning as the lowest tank runs out', () => {
    const low = channel('inkLowGlow');
    expect(low).toMatchObject({ source: 'inkLevels', target: 'ledInk' });
    expect(low.map).toMatchObject({ in: [0, 0.15], out: [0.9, 0] });
  });

  it('runs the carriage and pushes the page out only while printing', () => {
    expect(PRINTER.shots?.[0]?.when.anyOf[0]?.allOf[0]).toStrictEqual({
      signal: 'phase',
      op: 'eq',
      value: 'printing',
    });
    for (const id of ['carriageRun', 'paperOut']) {
      expect(channel(id).map).toStrictEqual({ type: 'enum', table: { printing: 1 } });
    }
  });

  it('is admitted for the live printer row', () => {
    const entry = entryFromSpec(PRINTER, { match: PRINTER_MODEL_MATCH, brands: ['Brother'] });
    expect('admitted' in admitEntry('plugin:printer', entry)).toBe(true);
    const subject = { brand: 'Brother', model: 'Brother DCP-T430W', family: 'printer' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
  });
});
