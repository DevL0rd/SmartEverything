import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAddToHome } from '../../../../src/features/home';
import { GroupScreen } from '../../../../src/features/device-groups/screens/group-screen';
import {
  parseGroupPageParams,
  routeId,
} from '../../../../src/features/device-groups/model/route-params';

export default function GroupRoute(): ReactNode {
  const raw = useLocalSearchParams();
  const addToHome = useAddToHome();
  const groupId = routeId(raw['groupId']) ?? '';
  return (
    <GroupScreen
      key={groupId}
      target={{ kind: 'group', groupId }}
      params={parseGroupPageParams(raw)}
      addToHome={addToHome}
    />
  );
}
