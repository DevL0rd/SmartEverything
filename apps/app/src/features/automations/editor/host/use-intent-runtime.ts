import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import type { NodeKindLookup } from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import type { Density, Size } from '@smarteverything/flow/graph/metrics';
import { useIdiom } from '../../../../design/platform';
import type { IntentRuntime } from './intent-env';

export function useDensity(): Density {
  return useIdiom() === 'touch' ? 'touch' : 'pointer';
}

export const NOTHING_MEASURED: ReadonlyMap<string, Size> = new Map();

export function intentRuntime(
  density: Density,
  check: CheckContext,
  kinds: NodeKindLookup,
  sizes: ReadonlyMap<string, Size>,
): IntentRuntime {
  return { newId: randomUUID, density, direction: 'ltr', check, kinds, sizes };
}

export function useIntentRuntime(
  check: CheckContext,
  kinds: NodeKindLookup,
  sizes: ReadonlyMap<string, Size>,
): IntentRuntime {
  const density = useDensity();
  return useMemo(() => intentRuntime(density, check, kinds, sizes), [density, check, kinds, sizes]);
}
