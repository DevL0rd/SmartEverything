import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RoomScreen } from '../../../../../src/features/home/screens/room-screen';

export default function RoomRoute(): ReactNode {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return <RoomScreen key={roomId} roomId={roomId} />;
}
