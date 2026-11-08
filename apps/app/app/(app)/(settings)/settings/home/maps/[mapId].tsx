import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MapScreenRoute } from '../../../../../../src/features/home-map/settings/map-screen';

export default function HomeMapSettingsRoute(): ReactNode {
  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  return <MapScreenRoute raw={mapId} />;
}
