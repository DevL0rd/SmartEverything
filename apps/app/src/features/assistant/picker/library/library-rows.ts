import type { ModelCandidate } from '../../data/model-candidates';
import type { SearchCandidates } from '../model-search-candidates';
import { candidateWhere, isNativeKey, matchesSources, type SourceFacts } from './library-sources';

export interface LibraryRow {
  readonly key: string;
  readonly candidate: ModelCandidate;
  readonly sources: readonly string[];
  readonly where: string | null;
  readonly reason: string | null;
  readonly favouriteId: string;
}

export function favouriteIdOf(candidate: ModelCandidate): string {
  return isNativeKey(candidate.key) ? candidate.key : candidate.model.id;
}

function rowOf(candidate: ModelCandidate, facts: SourceFacts, interactive: boolean): LibraryRow {
  const where = candidateWhere(candidate.key, candidate.model.supplierLabel, facts);
  return {
    key: candidate.key,
    candidate,
    sources: where.sources,
    where: where.line,
    reason: !where.ready || (interactive && candidate.pick === null) ? where.blame : null,
    favouriteId: favouriteIdOf(candidate),
  };
}

export function libraryRows(
  rows: SearchCandidates,
  facts: SourceFacts,
  interactive: boolean,
  sources: ReadonlySet<string>,
): readonly LibraryRow[] {
  return [...rows.current, ...rows.favorites, ...rows.all]
    .map((candidate) => rowOf(candidate, facts, interactive))
    .filter((row) => matchesSources(row.sources, sources));
}

export function selectedRow(
  rows: readonly LibraryRow[],
  selectedKey: string | null,
): LibraryRow | null {
  return (
    rows.find((row) => row.key === selectedKey) ??
    rows.find((row) => row.candidate.selected) ??
    rows[0] ??
    null
  );
}

export type LibraryView = 'ready' | 'loading' | 'error' | 'offline' | 'empty';

export interface ViewFacts {
  readonly rows: number;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly reachable: boolean;
}

export function libraryView({ rows, failed, loading, reachable }: ViewFacts): LibraryView {
  if (rows > 0) return 'ready';
  if (failed) return 'error';
  if (!reachable) return 'offline';
  return loading ? 'loading' : 'empty';
}
