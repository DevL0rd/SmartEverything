import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ProfileEditorScreen } from '../../../../../src/features/profiles';

export default function ProfileSettingsRoute(): ReactNode {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  return <ProfileEditorScreen profileId={profileId} />;
}
