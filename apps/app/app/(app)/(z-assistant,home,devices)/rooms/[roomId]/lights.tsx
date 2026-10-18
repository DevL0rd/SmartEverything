import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { roomLightsTarget } from '@smarteverything/domain';
import { useAddToHome } from '../../../../../src/features/home';
import { GroupScreen } from '../../../../../src/features/device-groups/screens/group-screen';
import {
  parseGroupPageParams,
  routeId,
} from '../../../../../src/features/device-groups/model/route-params';

export default function RoomLightsRoute(): ReactNode {
  const raw = useLocalSearchParams();
  const addToHome = useAddToHome();
  const roomId = routeId(raw['roomId']) ?? '';
  return (
    <GroupScreen
      key={roomId}
      target={roomLightsTarget(roomId)}
      params={parseGroupPageParams(raw)}
      addToHome={addToHome}
    />
  );
}
