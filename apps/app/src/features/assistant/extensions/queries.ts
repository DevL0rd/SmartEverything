import { useQuery } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiHarnessConfigurationCatalogue,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useSyncStatus } from '../../../store/selectors';
import { useHarnessSupported } from '../data/harness';

import {
  EXTENSIONS_KEY,
  EXTENSION_CONFIGURATION_KEY,
  RESOLVED_EXTENSION_KEY,
} from '../../../queries/extension-keys';
export {
  EXTENSIONS_KEY,
  EXTENSION_CONFIGURATION_KEY,
  RESOLVED_EXTENSION_KEY,
} from '../../../queries/extension-keys';

export function readExtensionConfiguration(): Promise<AiHarnessConfigurationCatalogue> {
  return api().call(E.readAiHarnessConfiguration, {});
}

export function useExtensionConfiguration(): ReturnType<
  typeof useQuery<AiHarnessConfigurationCatalogue>
> {
  const supported = useHarnessSupported();
  const sync = useSyncStatus();
  return useQuery({
    queryKey: EXTENSION_CONFIGURATION_KEY,
    enabled: supported && sync.status === 'live',
    queryFn: readExtensionConfiguration,
  });
}

export function useExtensions(): ReturnType<typeof useQuery<AiHarnessExtensions>> {
  const supported = useHarnessSupported();
  const sync = useSyncStatus();
  return useQuery({
    queryKey: EXTENSIONS_KEY,
    enabled: supported && sync.status === 'live',
    queryFn: () => api().call(E.readAiHarnessExtensions, {}),
  });
}

export function useResolvedExtension(
  id: string,
): ReturnType<typeof useQuery<HarnessExtensionItem>> {
  return useQuery({ queryKey: [...RESOLVED_EXTENSION_KEY, id], enabled: false });
}
