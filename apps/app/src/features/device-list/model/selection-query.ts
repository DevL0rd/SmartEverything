import { NO_SELECTION, type HomeMapSelection } from '../../home-map';
import { ANY, NO_ROOM } from './device-filter';

export interface SelectionQuery {
  readonly room: string;
  readonly device?: string | undefined;
}

export function selectionFromQuery(query: SelectionQuery): HomeMapSelection {
  if (query.device !== undefined && query.device !== '') {
    return { kind: 'device', deviceId: query.device };
  }
  if (query.room === ANY || query.room === NO_ROOM || query.room === '') return NO_SELECTION;
  return { kind: 'room', roomId: query.room };
}

export function withSelection<Query extends SelectionQuery>(
  query: Query,
  selection: HomeMapSelection,
): Query {
  switch (selection.kind) {
    case 'none':
      return { ...query, room: ANY, device: undefined };
    case 'room':
      return { ...query, room: selection.roomId, device: undefined };
    case 'device':
      return { ...query, room: ANY, device: selection.deviceId };
  }
}
