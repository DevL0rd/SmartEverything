import { useEffect, useState } from 'react';
import type { Engine } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';
import { usePickerSession } from '../picker/model-search-session';
interface Authority {
  readonly engine: Engine;
  readonly blocked: boolean;
}
export function useModelPickAuthority(authority: Authority): () => boolean {
  const session = usePickerSession();
  const [current] = useState(() => new ValueStore(authority));
  useEffect(() => {
    current.set(authority);
  }, [authority, current]);
  return (): boolean => session.valid() && current.get() === authority && !current.get().blocked;
}
