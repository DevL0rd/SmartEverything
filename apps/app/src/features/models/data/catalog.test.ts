import type { ModelCatalogRow, ModelOverrideRow, RowChange } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyChange } from '../../../store/live-reducers';
import { emptyState, type StoreState } from '../../../store/state';
import { modelCatalogOf, modelOverrideIndexOf } from './catalog';

function catalogRow(id: string, owner: string, version = '1.0.0'): ModelCatalogRow {
  return {
    id,
    version,
    owner,
    title: id,
    category: 'light',
    match: {
      exact: [],
      prefix: [],
      normalised: [],
      product: [],
      hardwareModel: [],
      families: ['light'],
    },
    brands: [],
    aliases: [],
    extras: [],
    spec_sha256: 'a'.repeat(64),
  };
}

function overrideRow(
  scope: ModelOverrideRow['scope'],
  target: string,
  at: string,
  modelId = 'dev.light.bulb',
): ModelOverrideRow {
  return {
    scope,
    target,
    model_id: modelId,
    asset_hash: null,
    finish: null,
    params: {},
    set_by: 'me',
    updated_at: at,
  };
}

function catalogChange(
  operation: RowChange['operation'],
  row: ModelCatalogRow,
): Extract<RowChange, { table: 'model_catalog' }> {
  return {
    type: 'change',
    table: 'model_catalog',
    operation,
    record: operation === 'DELETE' ? null : row,
    oldRecord: operation === 'DELETE' ? row : null,
  };
}

function overrideChange(
  operation: RowChange['operation'],
  row: ModelOverrideRow,
): Extract<RowChange, { table: 'model_overrides' }> {
  return {
    type: 'change',
    table: 'model_overrides',
    operation,
    record: operation === 'DELETE' ? null : row,
    oldRecord: operation === 'DELETE' ? row : null,
  };
}

function after(state: StoreState, ...changes: readonly RowChange[]): StoreState {
  return changes.reduce(applyChange, state);
}

describe('the synced model tables of the store', () => {
  it('keeps a model of each owner apart, in a steady order', () => {
    const state = after(
      emptyState(),
      catalogChange('INSERT', catalogRow('dev.light.bulb', 'plugin:wiz')),
      catalogChange('INSERT', catalogRow('dev.light.bulb', 'builtin')),
      catalogChange('INSERT', catalogRow('cat.living.sofa', 'builtin')),
    );
    expect(state.tables.model_catalog.rows.map((row) => `${row.id} ${row.owner}`)).toStrictEqual([
      'cat.living.sofa builtin',
      'dev.light.bulb builtin',
      'dev.light.bulb plugin:wiz',
    ]);
  });

  it('applies a new version of a model in place and removes a model its owner dropped', () => {
    const first = after(
      emptyState(),
      catalogChange('INSERT', catalogRow('dev.light.bulb', 'builtin')),
    );
    const updated = after(
      first,
      catalogChange('UPDATE', catalogRow('dev.light.bulb', 'builtin', '1.1.0')),
    );
    expect(updated.tables.model_catalog.rows.map((row) => row.version)).toStrictEqual(['1.1.0']);
    const removed = after(
      updated,
      catalogChange('DELETE', catalogRow('dev.light.bulb', 'builtin', '1.1.0')),
    );
    expect(removed.tables.model_catalog.ids).toStrictEqual([]);
  });

  it('holds one override per scope and target and drops it when it is reset', () => {
    const set = after(
      emptyState(),
      overrideChange('INSERT', overrideRow('device', 'd1', '2026-10-01T00:00:00.000Z')),
      overrideChange('INSERT', overrideRow('family', 'light', '2026-10-01T00:00:00.000Z')),
      overrideChange(
        'UPDATE',
        overrideRow('device', 'd1', '2026-10-02T00:00:00.000Z', 'dev.light.x'),
      ),
    );
    expect(set.tables.model_overrides.ids).toHaveLength(2);
    expect(set.tables.model_overrides.rows.find((row) => row.scope === 'device')?.model_id).toBe(
      'dev.light.x',
    );
    const reset = after(
      set,
      overrideChange('DELETE', overrideRow('device', 'd1', '2026-10-02T00:00:00.000Z')),
    );
    expect(reset.tables.model_overrides.rows.map((row) => row.scope)).toStrictEqual(['family']);
  });

  it('holds the asset inventory the file cache is cleared against', () => {
    const state = after(emptyState(), {
      type: 'change',
      table: 'model_assets',
      operation: 'INSERT',
      record: {
        sha256: 'e'.repeat(64),
        kind: 'spec',
        size: 10,
        owner: 'builtin',
        created: '2026-10-01T00:00:00.000Z',
      },
      oldRecord: null,
    });
    expect(state.tables.model_assets.ids).toStrictEqual(['e'.repeat(64)]);
  });
});

describe('the catalogue and override views over the tables', () => {
  it('builds one catalogue per row list and finds a model by id or alias', () => {
    const row = {
      ...catalogRow('dev.button.round', 'builtin'),
      aliases: ['dev.button.aqara-round'],
    };
    const rows = [row];
    const catalogue = modelCatalogOf(rows);
    expect(modelCatalogOf(rows)).toBe(catalogue);
    expect(catalogue.find('dev.button.aqara-round')?.id).toBe('dev.button.round');
    expect(catalogue.find('dev.button.round')?.id).toBe('dev.button.round');
    expect(catalogue.find('dev.missing')).toBeUndefined();
  });

  it('prefers the newest version of a model that two owners list', () => {
    const catalogue = modelCatalogOf([
      catalogRow('dev.light.bulb', 'builtin', '1.0.0'),
      catalogRow('dev.light.bulb', 'plugin:wiz', '1.2.0'),
    ]);
    expect(catalogue.find('dev.light.bulb')?.owner).toBe('plugin:wiz');
  });

  it('finds the override of a device, a make or a family and the latest of two rows for one target', () => {
    const rows = [
      overrideRow('device', 'd1', '2026-10-01T00:00:00.000Z', 'dev.light.old'),
      overrideRow('device', 'd1', '2026-10-03T00:00:00.000Z', 'dev.light.new'),
      overrideRow('family', 'fan', '2026-10-01T00:00:00.000Z'),
    ];
    const index = modelOverrideIndexOf(rows);
    expect(modelOverrideIndexOf(rows)).toBe(index);
    expect(index.find('device', 'd1')?.model_id).toBe('dev.light.new');
    expect(index.find('family', 'fan')?.scope).toBe('family');
    expect(index.find('identity', 'x')).toBeUndefined();
  });
});
