import { ValueStore, useValue } from '../../../design/external-store';

const drafts = new ValueStore<Readonly<Record<string, string>>>({});

export function useDraft(key: string): readonly [string, (text: string) => void] {
  const text = useValue(drafts)[key] ?? '';
  const set = (next: string): void => {
    drafts.update((all) => ({ ...all, [key]: next }));
  };
  return [text, set];
}
