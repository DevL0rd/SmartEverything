import { describe, expect, it } from 'vitest';

describe('vacuum data and model modules', () => {
  it('load together and export their hooks and models', async () => {
    const [
      actions,
      cleansQuery,
      demand,
      keys,
      scene,
      snapshot,
      vacuum,
      vacuumActions,
      vacuumPose,
      chips,
      lines,
      consumables,
      jobs,
      selection,
      stats,
    ] = await Promise.all([
      import('./actions'),
      import('./cleans-query'),
      import('./map-demand'),
      import('./keys'),
      import('./scene-query'),
      import('./snapshot'),
      import('./use-vacuum'),
      import('./use-vacuum-actions'),
      import('./use-vacuum-pose'),
      import('../model/phase-chip'),
      import('../model/phase-line'),
      import('../model/consumables'),
      import('../model/job-summary'),
      import('../model/room-selection'),
      import('../model/stats-series'),
    ]);
    expect(typeof actions.cleaningCommand).toBe('function');
    expect(typeof cleansQuery.useVacuumCleans).toBe('function');
    expect(typeof cleansQuery.useVacuumClean).toBe('function');
    expect(typeof demand.useVacuumMapDemand).toBe('function');
    expect(typeof scene.useVacuumScene).toBe('function');
    expect(typeof snapshot.snapshotOf).toBe('function');
    expect(typeof vacuum.useVacuum).toBe('function');
    expect(typeof vacuumActions.useVacuumActions).toBe('function');
    expect(typeof vacuumPose.useVacuumPose).toBe('function');
    expect(typeof chips.vacuumChipOf).toBe('function');
    expect(typeof lines.phaseLine).toBe('function');
    expect(typeof consumables.consumablesOf).toBe('function');
    expect(typeof jobs.jobSummaryOf).toBe('function');
    expect(typeof selection.roomChips).toBe('function');
    expect(typeof stats.statsOf).toBe('function');
    expect(keys.vacuumSceneKey('d', 'current', '3:current', 'none')).toStrictEqual([
      'window',
      'vacuum',
      'scene',
      'd',
      'current',
      '3:current',
      'none',
    ]);
  });
});
