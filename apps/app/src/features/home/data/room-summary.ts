import { useStoreSelector } from '../../../store/store-context';
import { roomSummaries, sameRoom, type RoomSummary } from '../model/rooms';

function sameSummary(left: RoomSummary | null, right: RoomSummary | null): boolean {
  return left === null || right === null ? left === right : sameRoom(left, right);
}

export function useRoomSummary(roomId: string): RoomSummary | null {
  return useStoreSelector(
    (state) => roomSummaries(state).find((summary) => summary.id === roomId) ?? null,
    sameSummary,
    [roomId],
  );
}
