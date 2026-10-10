import { remotePageOf } from '../../devices';
import { useDevices, useIrRemotes } from '../../../store/selectors';

export function useRemoteDevice(): (remoteId: string) => string | null {
  const devices = useDevices({ includeHidden: true });
  const remotes = useIrRemotes();
  return (remoteId) => {
    const remote = remotes.find((row) => row.id === remoteId);
    return remote === undefined ? null : remotePageOf(remote, devices);
  };
}
