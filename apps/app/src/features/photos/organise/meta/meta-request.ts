import { usePausable, ValueStore } from '../../../../design/external-store';

export interface MetaCurrent {
  readonly takenAt: string | null;
  readonly offsetMin: number | null;
  readonly place: { readonly lat: number; readonly lon: number } | null;
  readonly placeLabel: string | null;
}

export interface MetaRequest {
  readonly itemIds: readonly string[];
  readonly current: MetaCurrent | null;
  readonly onSaved?: () => void;
}

const request = new ValueStore<MetaRequest | null>(null);

export function openMetaEdit(next: MetaRequest): void {
  request.set(next);
}

export function closeMetaEdit(): void {
  request.set(null);
}

export function useMetaRequest(): MetaRequest | null {
  return usePausable(request.subscribe, request.get);
}
