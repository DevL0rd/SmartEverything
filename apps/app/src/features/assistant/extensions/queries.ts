import { queryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type AiHarnessConfigurationCatalogue,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useSyncStatus } from '../../../store/selectors';
import { EXTENSIONS_KEY, EXTENSION_CONFIGURATION_KEY } from '../../../queries/extension-keys';

function extensionsQuery(
  live: boolean,
): ReturnType<
  typeof queryOptions<AiHarnessExtensions, Error, AiHarnessExtensions, typeof EXTENSIONS_KEY>
> {
  return queryOptions({
    queryKey: EXTENSIONS_KEY,
    enabled: live,
    queryFn: () => api().call(E.readAiHarnessExtensions, {}),
  });
}

export function useExtensionConfiguration(): ReturnType<
  typeof useScreenQuery<AiHarnessConfigurationCatalogue>
> {
  const sync = useSyncStatus();
  return useScreenQuery({
    queryKey: EXTENSION_CONFIGURATION_KEY,
    enabled: sync.status === 'live',
    queryFn: () => api().call(E.readAiHarnessConfiguration, {}),
  });
}

export function useExtensions(): ReturnType<typeof useScreenQuery<AiHarnessExtensions>> {
  return useScreenQuery(extensionsQuery(useSyncStatus().status === 'live'));
}

export function useExtension(id: string): UseQueryResult<HarnessExtensionItem | null> {
  const live = useSyncStatus().status === 'live';
  return useScreenQuery({
    ...extensionsQuery(live),
    select: (catalogue) => catalogue.items.find((item) => item.id === id) ?? null,
  });
}
