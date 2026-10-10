import {
  USAGE_WORK,
  type UsagePart,
  type UsageSplit,
  type UsageWork,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon-glyphs';
import type { ColourRole } from '../../../design/tokens';
import { titleCase } from '../../../format/text';
import type { CostDimension } from './costs-params';

export interface DimensionInfo {
  readonly split: Exclude<UsageSplit, 'source'>;
  readonly label: string;
  readonly all: string;
  readonly heading: string;
  readonly icon: IconName;
  readonly colour: ColourRole;
}

export const DIMENSION_INFO: Readonly<Record<CostDimension, DimensionInfo>> = {
  person: {
    split: 'profile',
    label: 'Person',
    all: 'Everyone',
    heading: 'By person',
    icon: 'users',
    colour: 'primary',
  },
  chat: {
    split: 'chat',
    label: 'Chat',
    all: 'All chats',
    heading: 'By chat',
    icon: 'sparkles',
    colour: 'viz-3',
  },
  model: {
    split: 'model',
    label: 'Model',
    all: 'All models',
    heading: 'By model',
    icon: 'brain',
    colour: 'viz-2',
  },
  device: {
    split: 'client',
    label: 'Device',
    all: 'All devices',
    heading: 'By device',
    icon: 'smartphone',
    colour: 'info',
  },
  work: {
    split: 'work',
    label: 'Type of work',
    all: 'All work',
    heading: 'By type of work',
    icon: 'layers',
    colour: 'viz-1',
  },
  plugin: {
    split: 'plugin',
    label: 'Plugin',
    all: 'All plugins',
    heading: 'By plugin',
    icon: 'puzzle',
    colour: 'viz-5',
  },
};

const WORK_ICONS: Readonly<Record<UsageWork, IconName>> = {
  chat: 'sparkles',
  voice: 'mic',
  subagent: 'users',
  wake: 'bell',
  routine: 'automations',
  image: 'image',
  video: 'film',
  transcribe: 'list',
  embed: 'search',
  worker: 'cpu',
};

export function partTitle(part: UsagePart): string {
  return part.label ?? titleCase(part.key.replace(/[-_/]+/g, ' '));
}

export function partIcon(dimension: CostDimension, key: string): IconName {
  const work = USAGE_WORK.safeParse(key);
  return dimension === 'work' && work.success
    ? WORK_ICONS[work.data]
    : DIMENSION_INFO[dimension].icon;
}

export function providerOfModel(
  modelId: string,
): { readonly id: string; readonly name: string } | null {
  const slash = modelId.indexOf('/');
  if (slash <= 0) {
    return null;
  }
  const id = modelId.slice(0, slash);
  return { id, name: titleCase(id.replace(/[-_]+/g, ' ')) };
}
