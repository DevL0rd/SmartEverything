import { useState } from 'react';
import { confirm } from '../../../components/confirm-store';
import { removeVerdict, type SecretRowModel } from './secrets-model';

export type Editing =
  | { readonly kind: 'closed' }
  | { readonly kind: 'add' }
  | { readonly kind: 'replace'; readonly row: SecretRowModel };

const CLOSED: Editing = { kind: 'closed' };

export interface SecretFlow {
  readonly editing: Editing;
  readonly refusedId: string | null;
  readonly failure: string | null;
  readonly add: () => void;
  readonly replace: (row: SecretRowModel) => void;
  readonly close: () => void;
  readonly remove: (row: SecretRowModel) => Promise<void>;
}

export function useSecretFlow(onRemove: (secretId: string) => Promise<void>): SecretFlow {
  const [editing, setEditing] = useState<Editing>(CLOSED);
  const [refusedId, setRefusedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = async (row: SecretRowModel): Promise<void> => {
    setFailure(null);
    const verdict = removeVerdict(row);
    setRefusedId(verdict.allowed ? null : row.id);
    if (!verdict.allowed) return;
    const accepted = await confirm({
      title: `Remove ${row.name}?`,
      body: 'The value is deleted from your hub and cannot be read back.',
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    if (!accepted) return;
    await onRemove(row.id).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : 'The secret could not be removed.');
    });
  };
  return {
    editing,
    refusedId,
    failure,
    add: (): void => {
      setEditing({ kind: 'add' });
    },
    replace: (row): void => {
      setEditing({ kind: 'replace', row });
    },
    close: (): void => {
      setEditing(CLOSED);
    },
    remove,
  };
}
