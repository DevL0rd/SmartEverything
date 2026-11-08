import { MODEL_CATALOG_ROW, type ModelCatalogRow } from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

export interface ModelCatalogReplaced {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly superseded: readonly string[];
}

class ModelCatalogOwnerError extends Error {
  override readonly name = 'ModelCatalogOwnerError';

  constructor(id: string, owner: string, expected: string) {
    super(`The model ${id} names the owner ${owner}, but ${expected} is being replaced.`);
  }
}

class ModelCatalogDuplicateError extends Error {
  override readonly name = 'ModelCatalogDuplicateError';

  constructor(id: string, owner: string) {
    super(`The model ${id} is listed more than once for ${owner}.`);
  }
}

const COLUMNS = 'id, version, owner, title, category, match, brands, aliases, extras, spec_sha256';

const STORED = storedRow(MODEL_CATALOG_ROW, { json: ['match', 'brands', 'aliases', 'extras'] });

const SAVE = `insert into model_catalog (${COLUMNS})
  values ($id, $version, $owner, $title, $category, $match, $brands, $aliases, $extras,
          $spec_sha256)
  on conflict (id, owner) do update set
    version = excluded.version, title = excluded.title, category = excluded.category,
    match = excluded.match, brands = excluded.brands, aliases = excluded.aliases,
    extras = excluded.extras, spec_sha256 = excluded.spec_sha256`;

function hashesOf(row: ModelCatalogRow | undefined): string[] {
  if (row === undefined) return [];
  return row.spec_sha256 === null ? [] : [row.spec_sha256];
}

function unchanged(before: ModelCatalogRow, after: ModelCatalogRow): boolean {
  return jsonText(before) === jsonText(after);
}

export class ModelCatalogRepository {
  constructor(private readonly context: StoreContext) {}

  all(): ModelCatalogRow[] {
    return this.context.sql.all(STORED, `select ${COLUMNS} from model_catalog order by id, owner`);
  }

  forOwner(owner: string): ModelCatalogRow[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from model_catalog where owner = $owner order by id`,
      { owner },
    );
  }

  replaceOwner(owner: string, models: readonly ModelCatalogRow[]): ModelCatalogReplaced {
    const wanted = this.wanted(
      owner,
      models.map((model) => MODEL_CATALOG_ROW.parse(model)),
    );
    return this.context.write(() => {
      const known = new Map(this.forOwner(owner).map((row) => [row.id, row]));
      const superseded = new Set<string>();
      const written = this.write(wanted, known, superseded);
      const deleted = this.remove(owner, wanted, known, superseded);
      return { ...written, deleted, superseded: [...superseded] };
    });
  }

  private write(
    wanted: ReadonlyMap<string, ModelCatalogRow>,
    known: ReadonlyMap<string, ModelCatalogRow>,
    superseded: Set<string>,
  ): { readonly inserted: number; readonly updated: number } {
    let inserted = 0;
    let updated = 0;
    for (const row of wanted.values()) {
      const before = known.get(row.id);
      if (before !== undefined && unchanged(before, row)) continue;
      this.save(row);
      const operation = before === undefined ? 'INSERT' : 'UPDATE';
      this.context.changed('model_catalog', operation, row, before ?? null);
      if (before === undefined) inserted += 1;
      else updated += 1;
      for (const hash of hashesOf(before)) superseded.add(hash);
    }
    return { inserted, updated };
  }

  private remove(
    owner: string,
    wanted: ReadonlyMap<string, ModelCatalogRow>,
    known: ReadonlyMap<string, ModelCatalogRow>,
    superseded: Set<string>,
  ): number {
    let deleted = 0;
    for (const before of known.values()) {
      if (wanted.has(before.id)) continue;
      this.context.sql.run(
        'remove the model the owner no longer provides',
        'delete from model_catalog where id = $id and owner = $owner',
        { id: before.id, owner },
      );
      this.context.changed('model_catalog', 'DELETE', null, before);
      deleted += 1;
      for (const hash of hashesOf(before)) superseded.add(hash);
    }
    return deleted;
  }

  private wanted(owner: string, rows: readonly ModelCatalogRow[]): Map<string, ModelCatalogRow> {
    const wanted = new Map<string, ModelCatalogRow>();
    for (const row of rows) {
      if (row.owner !== owner) throw new ModelCatalogOwnerError(row.id, row.owner, owner);
      if (wanted.has(row.id)) throw new ModelCatalogDuplicateError(row.id, owner);
      wanted.set(row.id, row);
    }
    return wanted;
  }

  private save(row: ModelCatalogRow): void {
    this.context.sql.run('save the catalogue model', SAVE, {
      id: row.id,
      version: row.version,
      owner: row.owner,
      title: row.title,
      category: row.category,
      match: jsonText(row.match),
      brands: jsonText(row.brands),
      aliases: jsonText(row.aliases),
      extras: jsonText(row.extras),
      spec_sha256: row.spec_sha256,
    });
  }
}
