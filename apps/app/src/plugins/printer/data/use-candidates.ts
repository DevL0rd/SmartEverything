import type { UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { readPrinterView, type ViewOf } from './printer-api';

const SEARCH_POLL_MS = 2000;

export const CANDIDATES_KEY = ['window', 'printer', 'candidates'] as const;

export function useCandidates(): UseQueryResult<ViewOf<'candidates'>> {
  return useScreenQuery({
    queryKey: CANDIDATES_KEY,
    queryFn: () => readPrinterView(null, 'candidates'),
    refetchInterval: (query) => (query.state.data?.searching === true ? SEARCH_POLL_MS : false),
  });
}
