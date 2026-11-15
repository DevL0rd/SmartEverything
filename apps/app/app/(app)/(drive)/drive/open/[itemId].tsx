import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AccessScreen } from '../../../../../src/features/drive/requests/access-screen';

export default function Route(): ReactNode {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <AccessScreen itemId={itemId} />;
}
