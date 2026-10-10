import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { USAGE_WORK, type UsageWork } from '@smarteverything/domain';

export const RANGES = ['today', '7d', '30d', 'month', 'custom'] as const;

export type CostRange = (typeof RANGES)[number];

export const DIMENSIONS = ['person', 'chat', 'model', 'device', 'work', 'plugin'] as const;

export type CostDimension = (typeof DIMENSIONS)[number];

const DAY = z.iso.date();
const KEY = z.string().trim().min(1).max(200);

const PARAMS = z.object({
  range: z.enum(RANGES).catch('30d'),
  from: DAY.optional().catch(undefined),
  to: DAY.optional().catch(undefined),
  person: KEY.optional().catch(undefined),
  chat: KEY.optional().catch(undefined),
  model: KEY.optional().catch(undefined),
  device: KEY.optional().catch(undefined),
  work: USAGE_WORK.optional().catch(undefined),
  plugin: KEY.optional().catch(undefined),
});

export type CostParams = z.output<typeof PARAMS>;

export type CostFilters = Pick<CostParams, CostDimension>;

export interface CostQuery {
  profileIds?: string[];
  clientIds?: string[];
  works?: UsageWork[];
  modelIds?: string[];
  chatId?: string;
  pluginId?: string;
}

export function queryOf(filters: CostFilters): CostQuery {
  const { person, chat, model, device, work, plugin } = filters;
  return {
    ...(person === undefined ? {} : { profileIds: [person] }),
    ...(device === undefined ? {} : { clientIds: [device] }),
    ...(work === undefined ? {} : { works: [work] }),
    ...(model === undefined ? {} : { modelIds: [model] }),
    ...(chat === undefined ? {} : { chatId: chat }),
    ...(plugin === undefined ? {} : { pluginId: plugin }),
  };
}

export function filterKey(filters: CostFilters): string {
  return DIMENSIONS.map((dimension) => filters[dimension] ?? '*').join('|');
}

export function isFiltered(filters: CostFilters): boolean {
  return DIMENSIONS.some((dimension) => filters[dimension] !== undefined);
}

function cleared(): Record<CostDimension, undefined> {
  return {
    person: undefined,
    chat: undefined,
    model: undefined,
    device: undefined,
    work: undefined,
    plugin: undefined,
  };
}

export interface CostParamsState {
  readonly params: CostParams;
  readonly set: (change: Partial<Record<keyof CostParams, string | undefined>>) => void;
  readonly clear: () => void;
  readonly reset: () => void;
}

export function useCostParams(): CostParamsState {
  const raw = useLocalSearchParams();
  const router = useRouter();
  const params = PARAMS.parse(raw);
  return {
    params,
    set: (change): void => {
      router.setParams(change);
    },
    clear: (): void => {
      router.setParams(cleared());
    },
    reset: (): void => {
      router.setParams({ ...cleared(), range: undefined, from: undefined, to: undefined });
    },
  };
}
