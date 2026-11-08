import {
  MODEL_SPEC,
  type ModelCatalogRow,
  type ModelExtra,
  type ModelMatch,
  type ModelSpec,
  type PluginModelContribution,
} from '@smarteverything/domain';
import { sha256Of, type NewModelAsset } from '../store/repositories/model-assets';

export const MODEL_SPEC_BYTE_LIMIT = 256 * 1024;

export type ModelContent = Uint8Array | { readonly problem: string };

export interface ModelFile {
  readonly path: string;
  readonly content: ModelContent;
  readonly declaredSha256: string | null;
}

export interface ModelEntry {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly match: ModelMatch;
  readonly brands: readonly string[];
  readonly extras: readonly ModelExtra[];
  readonly spec: ModelFile;
}

export interface ModelContributionFiles {
  readonly spec: ModelContent;
}

export interface ModelCodeDeclaration {
  readonly match?: Partial<ModelMatch>;
  readonly brands?: readonly string[];
  readonly extras?: readonly ModelExtra[];
}

export interface AdmittedModel {
  readonly row: ModelCatalogRow;
  readonly assets: readonly NewModelAsset[];
}

export interface ModelRejection {
  readonly id: string;
  readonly file: string;
  readonly problem: string;
}

export type Admission =
  { readonly admitted: AdmittedModel } | { readonly rejection: ModelRejection };

export type Checked<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

const EMPTY_MATCH: ModelMatch = {
  exact: [],
  prefix: [],
  normalised: [],
  product: [],
  hardwareModel: [],
  families: [],
};

const ENCODER = new TextEncoder();

const DECODER = new TextDecoder('utf-8', { fatal: true });

function pass<T>(value: T): Checked<T> {
  return { ok: true, value };
}

function fail(problem: string): Checked<never> {
  return { ok: false, problem };
}

function readContent(file: ModelFile, limit: number): Checked<Uint8Array> {
  const { content } = file;
  if (!(content instanceof Uint8Array)) return fail(content.problem);
  if (content.byteLength === 0) return fail('is empty');
  if (content.byteLength > limit) {
    return fail(`is ${String(content.byteLength)} bytes, over the ${String(limit)} byte limit`);
  }
  if (file.declaredSha256 !== null && sha256Of(content) !== file.declaredSha256) {
    return fail('does not match the sha256 the manifest declares');
  }
  return pass(content);
}

function decodeJson(bytes: Uint8Array): Checked<unknown> {
  try {
    return pass(JSON.parse(DECODER.decode(bytes)));
  } catch (cause) {
    return fail(`is not valid UTF-8 JSON (${cause instanceof Error ? cause.name : 'rejected'})`);
  }
}

export interface CheckedSpec {
  readonly spec: ModelSpec;
  readonly bytes: Uint8Array;
}

export function checkSpecFile(file: ModelFile): Checked<CheckedSpec> {
  const read = readContent(file, MODEL_SPEC_BYTE_LIMIT);
  if (!read.ok) return read;
  const json = decodeJson(read.value);
  if (!json.ok) return json;
  const parsed = MODEL_SPEC.safeParse(json.value);
  if (parsed.success) return pass({ spec: parsed.data, bytes: read.value });
  const issue = parsed.error.issues[0];
  const where = issue === undefined ? '' : issue.path.map(String).join('.');
  return fail(`is not a valid model spec (${where}: ${issue?.message ?? 'rejected'})`);
}

export function entryFromContribution(
  contribution: PluginModelContribution,
  files: ModelContributionFiles,
): ModelEntry {
  return {
    id: contribution.id,
    title: contribution.title,
    version: contribution.version,
    match: contribution.match,
    brands: contribution.brands,
    extras: contribution.extras,
    spec: {
      path: contribution.spec,
      content: files.spec,
      declaredSha256: contribution.specSha256,
    },
  };
}

export function entryFromSpec(spec: ModelSpec, declaration: ModelCodeDeclaration = {}): ModelEntry {
  return {
    id: spec.id,
    title: spec.title,
    version: spec.version,
    match: { ...EMPTY_MATCH, ...declaration.match },
    brands: declaration.brands ?? [],
    extras: declaration.extras ?? [],
    spec: {
      path: `${spec.id}.json`,
      content: ENCODER.encode(JSON.stringify(spec)),
      declaredSha256: null,
    },
  };
}

function rejected(entry: ModelEntry, file: string, problem: string): Admission {
  return { rejection: { id: entry.id, file, problem } };
}

function identityProblem(entry: ModelEntry, spec: ModelSpec): string | null {
  if (spec.id !== entry.id) return `holds the model ${spec.id}, not the declared ${entry.id}`;
  if (spec.version !== entry.version) {
    return `is version ${spec.version}, not the declared ${entry.version}`;
  }
  return null;
}

function rowOf(
  owner: string,
  entry: ModelEntry,
  spec: ModelSpec,
  specSha256: string,
): ModelCatalogRow {
  return {
    id: entry.id,
    version: entry.version,
    owner,
    title: entry.title,
    category: spec.category,
    match: entry.match,
    brands: [...entry.brands],
    aliases: [...(spec.meta?.aliases ?? [])],
    extras: [...entry.extras],
    spec_sha256: specSha256,
  };
}

export function admitEntry(owner: string, entry: ModelEntry): Admission {
  const spec = checkSpecFile(entry.spec);
  if (!spec.ok) return rejected(entry, entry.spec.path, spec.problem);
  const mismatch = identityProblem(entry, spec.value.spec);
  if (mismatch !== null) return rejected(entry, entry.spec.path, mismatch);
  const assets: NewModelAsset[] = [{ kind: 'spec', owner, bytes: spec.value.bytes }];
  const specSha256 = sha256Of(spec.value.bytes);
  return { admitted: { row: rowOf(owner, entry, spec.value.spec, specSha256), assets } };
}

export function rejectionDetail(rejections: readonly ModelRejection[]): string | null {
  if (rejections.length === 0) return null;
  const lines = rejections.map((item) => `${item.file} (${item.id}) ${item.problem}`);
  return `Model files rejected: ${lines.join('; ')}`;
}
