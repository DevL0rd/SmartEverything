import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot } from '@smarteverything/domain';
import { MyDriveHero, SharedDriveHero } from './drive-hero';
import type { DriveUse } from './hero-model';
import { QuickAccessRow } from './quick-access';

export function DriveTop({
  root,
  use,
}: {
  readonly root: DriveRoot;
  readonly use: DriveUse;
}): ReactNode {
  return (
    <View className="gap-3">
      {root.scope === 'home' ? (
        <SharedDriveHero root={root} />
      ) : (
        <MyDriveHero root={root} use={use} />
      )}
      <QuickAccessRow rootId={root.id} />
    </View>
  );
}
