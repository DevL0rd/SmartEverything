import { PLUGIN_SOURCE_PREFIX, SIGNAL_RATES, SIGNAL_SOURCES, signalRateOf } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';

describe('signal rate caps', () => {
  it('resolve for every kind of every built-in signal source', () => {
    const missing = SIGNAL_SOURCES.flatMap((source) =>
      source.kinds
        .filter((kind) => signalRateOf(source.source, kind.kind) === null)
        .map((kind) => `${source.source}/${kind.kind}`),
    );
    expect(missing).toStrictEqual([]);
  });

  it('name only sources and kinds that exist', () => {
    const orphans = SIGNAL_RATES.filter((line) => {
      if (line.source.startsWith(PLUGIN_SOURCE_PREFIX)) return false;
      const source = SIGNAL_SOURCES.find((candidate) => candidate.source === line.source);
      return (
        source === undefined ||
        (line.kind !== undefined && !source.kinds.some((kind) => kind.kind === line.kind))
      );
    }).map((line) => `${line.source}/${line.kind ?? '*'}`);
    expect(orphans).toStrictEqual([]);
  });

  it('have a positive rate, burst and key for every line', () => {
    const broken = SIGNAL_RATES.filter(
      (line) => line.perMinute <= 0 || line.burst <= 0 || line.per.length === 0,
    ).map((line) => `${line.source}/${line.kind ?? '*'}`);
    expect(broken).toStrictEqual([]);
  });

  it('have at most one line for each source and kind', () => {
    const keys = SIGNAL_RATES.map((line) => `${line.source}/${line.kind ?? '*'}`);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toStrictEqual([]);
  });

  it('keep every urgent kind a pulse, since only pulses are dropped in a global flood', () => {
    const wrong = SIGNAL_SOURCES.flatMap((source) =>
      source.kinds
        .filter((kind) => kind.urgent === true && !kind.pulse)
        .map((kind) => `${source.source}/${kind.kind}`),
    );
    expect(wrong).toStrictEqual([]);
  });
});
