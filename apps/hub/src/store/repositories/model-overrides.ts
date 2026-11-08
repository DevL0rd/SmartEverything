import {
  MODEL_OVERRIDE_ROW,
  type ModelOverrideRow,
  type ModelOverrideScope,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

export interface NewModelOverride {
  readonly scope: ModelOverrideScope;
  readonly target: string;
  readonly modelId?: string | undefined;
  readonly assetHash?: string | undefined;
  readonly finish?: string | undefined;
  readonly params?: Readonly<Record<string, number>> | undefined;
  readonly setBy: string;
}

const COLUMNS = 'scope, target, model_id, asset_hash, finish, params, set_by, updated_at';

const STORED = storedRow(MODEL_OVERRIDE_ROW, { json: ['params'] });

const SAVE = `insert into model_overrides (${COLUMNS})
  values ($scope, $target, $model_id, $asset_hash, $finish, $params, $set_by, $updated_at)
  on conflict (scope, target) do update set
    model_id = excluded.model_id, asset_hash = excluded.asset_hash, finish = excluded.finish,
    params = excluded.params, set_by = excluded.set_by, updated_at = excluded.updated_at`;

export class ModelOverridesRepository {
  constructor(private readonly context: StoreContext) {}

  all(): ModelOverrideRow[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from model_overrides order by scope, target`,
    );
  }

  find(scope: ModelOverrideScope, target: string): ModelOverrideRow | undefined {
    return this.context.sql.get(
      STORED,
      `select ${COLUMNS} from model_overrides where scope = $scope and target = $target`,
      { scope, target },
    );
  }

  set(override: NewModelOverride): ModelOverrideRow {
    return this.context.write(() => {
      const row = MODEL_OVERRIDE_ROW.parse({
        scope: override.scope,
        target: override.target,
        model_id: override.modelId ?? null,
        asset_hash: override.assetHash ?? null,
        finish: override.finish ?? null,
        params: override.params ?? {},
        set_by: override.setBy,
        updated_at: this.context.now(),
      });
      const before = this.find(row.scope, row.target);
      this.context.sql.run('save the model override', SAVE, {
        ...row,
        params: jsonText(row.params),
      });
      this.context.changed(
        'model_overrides',
        before === undefined ? 'INSERT' : 'UPDATE',
        row,
        before ?? null,
      );
      return row;
    });
  }

  reset(scope: ModelOverrideScope, target: string): ModelOverrideRow | undefined {
    return this.context.write(() => {
      const before = this.find(scope, target);
      if (before === undefined) return undefined;
      this.context.sql.run(
        'reset the model override',
        'delete from model_overrides where scope = $scope and target = $target',
        { scope, target },
      );
      this.context.changed('model_overrides', 'DELETE', null, before);
      return before;
    });
  }
}
