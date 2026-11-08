import type {
  DeviceModels,
  ModelAssetStored,
  ModelOverrideInput,
  ModelOverrideScope,
  ModelSource,
} from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { AppHref } from '../../components/app-href';
import type { IconName } from '../../components/icon-glyphs';

export const MODEL_PAGE = 'model-look';

export const MODEL_PAGE_TITLE = 'Model and look';

export const MODEL_PAGE_ICON: IconName = 'palette';

export const MODEL_PAGE_WORDS: readonly string[] = [
  '3D model',
  'model',
  'look',
  'appearance',
  'finish',
  'colour',
  'color',
  'material',
  'upload',
  'own model',
  'custom model',
  'glb',
  'graphic',
  'picture',
  'override',
  'reset model',
  'default model',
];

export interface ModelPageItem {
  readonly title: string;
  readonly keywords: readonly string[];
  readonly link: AppHref;
  readonly icon: IconName;
}

export function modelPageItem(deviceId: string): ModelPageItem {
  return {
    title: MODEL_PAGE_TITLE,
    keywords: MODEL_PAGE_WORDS,
    link: href.settings.device(deviceId, MODEL_PAGE),
    icon: MODEL_PAGE_ICON,
  };
}

const SOURCE_TEXT: Readonly<Record<ModelSource, string>> = {
  'device-override': 'Chosen for this device',
  'identity-override': 'Chosen for every device of this make and model',
  'family-override': 'Chosen for every device of this kind',
  'plugin-identity': 'Provided for this make and model',
  'plugin-family': 'Provided for this kind of device',
  'kind-default': 'The standard model for this kind of device',
  none: 'No model for this kind of device yet',
};

export function sourceText(source: ModelSource): string {
  return SOURCE_TEXT[source];
}

const OVERRIDE_SCOPE: Readonly<Partial<Record<ModelSource, ModelOverrideScope>>> = {
  'device-override': 'device',
  'identity-override': 'identity',
  'family-override': 'family',
};

export function activeScopeOf(source: ModelSource): ModelOverrideScope | null {
  return OVERRIDE_SCOPE[source] ?? null;
}

export const SCOPE_LABELS: Readonly<Record<ModelOverrideScope, string>> = {
  device: 'This device',
  identity: 'Same model',
  family: 'Same kind',
};

export const SCOPE_SPOKEN: Readonly<Record<ModelOverrideScope, string>> = {
  device: 'Only this device',
  identity: 'Every device of this make and model',
  family: 'Every device of this kind',
};

export interface PickerRow {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly provided: boolean;
  readonly chosen: boolean;
}

export interface CatalogueTitles {
  readonly titleOf: (id: string) => { readonly title: string; readonly category: string } | null;
}

export function pickerRows(
  models: Pick<DeviceModels, 'candidates' | 'model'>,
  providedId: string | null,
  catalogue: CatalogueTitles,
): readonly PickerRow[] {
  const chosenId = models.model.asset_hash === null ? models.model.id : null;
  const listed = models.candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
  }));
  const provided = providedId === null ? null : catalogue.titleOf(providedId);
  const missing =
    providedId === null || provided === null || listed.some((row) => row.id === providedId)
      ? []
      : [{ id: providedId, ...provided }];
  return [...missing, ...listed]
    .map((row) => ({ ...row, provided: row.id === providedId, chosen: row.id === chosenId }))
    .sort((left, right) => Number(right.provided) - Number(left.provided));
}

export function finishLabel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[-_.]+/gu, ' ')
    .trim()
    .toLowerCase();
  return words === '' ? name : words.charAt(0).toUpperCase() + words.slice(1);
}

export function shownFinish(models: Pick<DeviceModels, 'model' | 'default_finish'>): string | null {
  return models.model.finish ?? models.default_finish;
}

export function finishInput(
  models: Pick<DeviceModels, 'model'>,
  scope: ModelOverrideScope,
  finish: string,
): ModelOverrideInput | null {
  const { id, asset_hash: assetHash } = models.model;
  if (assetHash !== null) return { scope, asset_hash: assetHash, finish };
  return id === null ? null : { scope, model_id: id, finish };
}

export type UploadKind = ModelAssetStored['kind'];

const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46] as const;

export class ModelFileError extends Error {
  override readonly name = 'ModelFileError';
}

export function uploadKindOf(name: string, bytes: Uint8Array): UploadKind {
  if (GLB_MAGIC.every((byte, at) => bytes[at] === byte)) return 'glb';
  if (name.toLowerCase().endsWith('.json')) return 'spec';
  throw new ModelFileError('Choose a .glb model file or a model .json file.');
}

export const UPLOAD_HINT = 'A .glb model file or a model .json file.';

export const OWNER_ONLY_UPLOAD = 'Only the home owner can upload a model file.';
