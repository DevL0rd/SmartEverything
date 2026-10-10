import { useModelRow } from './model-queries';

export interface ModelName {
  readonly name: string;
  readonly provider: string;
  readonly providerLabel: string;
}

export function useModelName(id: string): ModelName | null | undefined {
  const query = useModelRow(id);
  if (query.isPending) {
    return undefined;
  }
  if (query.data === undefined) {
    return null;
  }
  return {
    name: query.data.name,
    provider: query.data.provider,
    providerLabel: query.data.providerLabel,
  };
}
