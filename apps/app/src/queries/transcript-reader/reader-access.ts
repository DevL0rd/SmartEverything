import { useEffect } from 'react';
import { useQueryClient, type QueryClient, type QueryFilters } from '@tanstack/react-query';
import { z } from 'zod';
import { API_ERROR_CODES } from '@smarteverything/domain';
import {
  TRANSCRIPT_READER_PREFIX,
  TRANSCRIPT_SOURCE_PREFIX,
  type TranscriptFeedPort,
} from '../../components/transcript-feed/port';

const READER_ERROR = z.object({
  name: z.literal('ApiError'),
  code: z.enum(API_ERROR_CODES),
});
const ACCESS_CODES: ReadonlySet<string> = new Set([
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'upstream_failed',
]);

type Scope = Pick<TranscriptFeedPort, 'source' | 'scope'>;

export function transcriptScopeQueries(scope: Scope): QueryFilters {
  return {
    queryKey: ['window'],
    predicate: (query) =>
      (query.queryKey[1] === TRANSCRIPT_READER_PREFIX[1] ||
        query.queryKey[1] === TRANSCRIPT_SOURCE_PREFIX[1]) &&
      query.queryKey[2] === scope.source &&
      query.queryKey[3] === scope.scope,
  };
}

export function transcriptAccessDenied(error: unknown): boolean {
  const read = READER_ERROR.safeParse(error);
  if (!read.success) return false;
  return ACCESS_CODES.has(read.data.code);
}

export function clearTranscriptScope(client: QueryClient, scope: Scope): void {
  const filters = transcriptScopeQueries(scope);
  void client.cancelQueries(filters, { revert: false, silent: true });
  client.removeQueries(filters);
}

function retireTranscriptScope(client: QueryClient, scope: Scope, error: Error): void {
  const filters = transcriptScopeQueries(scope);
  void client.cancelQueries(filters, { revert: false, silent: true });
  for (const query of client.getQueryCache().findAll(filters)) {
    query.setState({
      data: undefined,
      dataUpdatedAt: 0,
      error,
      status: 'error',
      fetchStatus: 'idle',
    });
  }
}

export function useTranscriptAccess(scope: Scope, error: Error | null): boolean {
  const client = useQueryClient();
  const retired = transcriptAccessDenied(error);
  const { source, scope: id } = scope;
  useEffect(() => {
    if (retired && error !== null) retireTranscriptScope(client, { source, scope: id }, error);
  }, [client, source, id, retired, error]);
  return retired;
}
