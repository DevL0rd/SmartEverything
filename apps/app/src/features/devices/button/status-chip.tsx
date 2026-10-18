import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';

export function RoomChip({
  online,
  room,
}: {
  readonly online: boolean;
  readonly room: string | null;
}): ReactNode {
  if (!online) {
    return <Badge label="Offline" icon="wifi" />;
  }
  return room === null ? null : <Badge label={room} />;
}
