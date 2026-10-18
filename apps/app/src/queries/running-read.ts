import type { QueryClient, QueryKey } from '@tanstack/react-query';

export function runningRead(client: QueryClient, key: QueryKey): Promise<unknown> | undefined {
  if (client.isFetching({ queryKey: key, exact: true }) === 0) return undefined;
  return client.getQueryCache().find({ queryKey: key, exact: true })?.promise;
}
