import { useIrRemotes } from '../../../store/selectors';

export function useRemoteDevice(): (remoteId: string) => string | null {
  const remotes = useIrRemotes();
  return (remoteId) => remotes.find((row) => row.id === remoteId)?.blaster_id ?? null;
}
