import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { TabStack } from '../../../src/app-shell/tab-stack';
import { NewAlbumHost } from '../../../src/features/photos/albums/new-album-host';
import { MetaEditHost } from '../../../src/features/photos/organise/meta/meta-sheet';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../src/features/photos/components/photos-error-boundary';

export const unstable_settings = { initialRouteName: 'photos/(sections)' };

export default function GroupLayout(): ReactNode {
  return (
    <>
      <TabStack initialRouteName={unstable_settings.initialRouteName}>
        <Stack.Screen name="photos/(sections)" dangerouslySingular />
      </TabStack>
      <MetaEditHost />
      <NewAlbumHost />
    </>
  );
}
