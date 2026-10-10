import { ValueStore, useSelected } from '../../../design/external-store';

const editing = new ValueStore<string | null>(null);

export function useIsEditing(messageId: string): boolean {
  return useSelected(editing, (current) => current === messageId);
}

export function startEditing(messageId: string): void {
  editing.set(messageId);
}

export function stopEditing(): void {
  editing.set(null);
}
