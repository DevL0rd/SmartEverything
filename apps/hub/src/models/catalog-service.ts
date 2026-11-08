import {
  createModelCatalog,
  MODEL_OWNER,
  type ModelCatalog,
  type ModelCatalogRow,
  type ModelTie,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ModelAssetsRepository } from '../store/repositories/model-assets';
import type { ModelCatalogRepository } from '../store/repositories/model-catalog';
import {
  admitEntry,
  checkSpecFile,
  rejectionDetail,
  type AdmittedModel,
  type ModelEntry,
  type ModelRejection,
} from './contributions';

export interface ModelCatalogStores {
  readonly assets: Pick<ModelAssetsRepository, 'save' | 'release'>;
  readonly catalog: Pick<ModelCatalogRepository, 'all' | 'replaceOwner'>;
}

export interface ModelBatch {
  readonly owner: string;
  readonly entries: readonly ModelEntry[];
}

export interface ModelBatchResult {
  readonly owner: string;
  readonly accepted: readonly string[];
  readonly rejections: readonly ModelRejection[];
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly released: number;
  readonly statusDetail: string | null;
}

export type UserSpecResult =
  | { readonly stored: true; readonly sha256: string; readonly modelId: string }
  | { readonly stored: false; readonly problem: string };

function namesOf(row: ModelCatalogRow): string[] {
  return [row.id, ...row.aliases];
}

function namesOfOthers(rows: readonly ModelCatalogRow[], owner: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.owner === owner) continue;
    for (const name of namesOf(row)) names.set(name, row.owner);
  }
  return names;
}

function guardedFromOthers(owner: string): boolean {
  return owner.startsWith('plugin:');
}

export class ModelCatalogService {
  private readonly log = new Logger('hub.models');

  constructor(private readonly stores: ModelCatalogStores) {}

  readonly reportTie = (tie: ModelTie): void => {
    this.log.info('model_resolution.tie_broken', {
      deviceId: tie.deviceId,
      tier: tie.tier,
      winner: tie.winner,
      rival: tie.rival,
    });
  };

  catalog(): ModelCatalog {
    return createModelCatalog(this.stores.catalog.all());
  }

  replace(batch: ModelBatch): ModelBatchResult {
    const owner = MODEL_OWNER.parse(batch.owner);
    const operation = this.log.operation('model_catalog.replace', { owner });
    try {
      const sorted = this.admit(owner, batch.entries);
      const result = this.store(owner, sorted.admitted, sorted.rejections);
      this.report(result);
      operation.succeeded({
        accepted: result.accepted.length,
        rejected: result.rejections.length,
        inserted: result.inserted,
        updated: result.updated,
        deleted: result.deleted,
        released: result.released,
      });
      return result;
    } catch (cause) {
      operation.failed(cause);
      throw cause;
    }
  }

  remove(owner: string): ModelBatchResult {
    return this.replace({ owner, entries: [] });
  }

  storeUserSpec(profile: string, bytes: Uint8Array): UserSpecResult {
    const checked = checkSpecFile({ path: 'model.json', content: bytes, declaredSha256: null });
    if (!checked.ok) {
      this.log.warn('model_asset.user_spec_rejected', { profile, problem: checked.problem });
      return { stored: false, problem: checked.problem };
    }
    const row = this.stores.assets.save({
      kind: 'spec',
      owner: `user:${profile}`,
      bytes: checked.value.bytes,
    });
    this.log.info('model_asset.user_spec_stored', {
      profile,
      modelId: checked.value.spec.id,
      sha256: row.sha256,
    });
    return { stored: true, sha256: row.sha256, modelId: checked.value.spec.id };
  }

  private admit(
    owner: string,
    entries: readonly ModelEntry[],
  ): { admitted: AdmittedModel[]; rejections: ModelRejection[] } {
    const held = this.heldByOthers(owner);
    const taken = new Map<string, string>();
    const admitted: AdmittedModel[] = [];
    const rejections: ModelRejection[] = [];
    for (const entry of entries) {
      const outcome = admitEntry(owner, entry);
      if ('rejection' in outcome) {
        rejections.push(outcome.rejection);
        continue;
      }
      const problem = clash(outcome.admitted.row, held, taken);
      if (problem !== null) {
        rejections.push({ id: entry.id, file: entry.spec.path, problem });
        continue;
      }
      for (const name of namesOf(outcome.admitted.row)) taken.set(name, entry.id);
      admitted.push(outcome.admitted);
    }
    return { admitted, rejections };
  }

  private heldByOthers(owner: string): ReadonlyMap<string, string> {
    if (!guardedFromOthers(owner)) return new Map();
    return namesOfOthers(this.stores.catalog.all(), owner);
  }

  private store(
    owner: string,
    admitted: readonly AdmittedModel[],
    rejections: readonly ModelRejection[],
  ): ModelBatchResult {
    for (const model of admitted) {
      for (const asset of model.assets) this.stores.assets.save(asset);
    }
    const replaced = this.stores.catalog.replaceOwner(
      owner,
      admitted.map((model) => model.row),
    );
    const released = this.stores.assets.release(replaced.superseded);
    for (const { row } of admitted) {
      this.log.debug('model_catalog.model_admitted', () => ({
        owner,
        modelId: row.id,
        version: row.version,
        specSha256: row.spec_sha256,
      }));
    }
    return {
      owner,
      accepted: admitted.map((model) => model.row.id),
      rejections,
      inserted: replaced.inserted,
      updated: replaced.updated,
      deleted: replaced.deleted,
      released,
      statusDetail: rejectionDetail(rejections),
    };
  }

  private report(result: ModelBatchResult): void {
    for (const rejection of result.rejections) {
      this.log.warn('model_catalog.model_rejected', {
        owner: result.owner,
        modelId: rejection.id,
        file: rejection.file,
        problem: rejection.problem,
      });
    }
  }
}

function clash(
  row: ModelCatalogRow,
  held: ReadonlyMap<string, string>,
  taken: ReadonlyMap<string, string>,
): string | null {
  for (const name of namesOf(row)) {
    const own = taken.get(name);
    if (own !== undefined) return `uses the name ${name}, already listed by ${own}`;
    const other = held.get(name);
    if (other !== undefined) return `uses the name ${name}, which ${other} provides`;
  }
  return null;
}
