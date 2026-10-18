import type { ConfirmRequest } from '../../components/confirm-store';

export function overrideFolder(label: string): ConfirmRequest {
  return {
    title: 'Make this computer’s files win?',
    body: `Other devices’ different copies of ${label} are overwritten with the files on this computer.`,
    confirmLabel: 'Overwrite',
    tone: 'destructive',
  };
}

export function revertFolder(label: string): ConfirmRequest {
  return {
    title: 'Undo local changes?',
    body: `Files you changed here in ${label} go back to the other devices’ versions, and files you added here are deleted.`,
    confirmLabel: 'Undo changes',
    tone: 'destructive',
  };
}
