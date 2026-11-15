import { createURL } from 'expo-linking';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { CopyField } from '../../../components/copy-field';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { useSettings, useSyncStatus } from '../../../store/selectors';
import { useDriveItem, useItemLockSet } from '../data';
import type { DriveAccess } from '../model/drive-access';
import {
  SCREENSHOT_LINE,
  VIEW_ONLY_TITLE,
  peopleLinkLineOf,
  peopleLinkOf,
  viewOnlyInherited,
  viewOnlyLineOf,
  viewOnlyShownOf,
} from './share-model';

export function ViewOnlyRow({
  item,
  access,
}: {
  readonly item: Pick<DriveItem, 'id' | 'locked' | 'lockedHere' | 'rootId'>;
  readonly access: DriveAccess;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const lock = useItemLockSet();
  const current = useDriveItem(item.id, item.rootId).data ?? item;
  const { locked } = current;
  if (!viewOnlyShownOf(access)) return null;
  return (
    <View className="gap-1">
      <SwitchRow
        title={VIEW_ONLY_TITLE}
        subtitle={viewOnlyLineOf(current)}
        wrapSubtitle
        icon={locked ? 'eyeOff' : 'download'}
        value={!locked}
        disabled={!live || lock.busy || viewOnlyInherited(current)}
        onChange={(allowed) => {
          lock.run({ itemId: item.id, locked: !allowed });
        }}
      />
      <Text variant="caption" tone="variant" className="px-1">
        {SCREENSHOT_LINE}
      </Text>
      {lock.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {lock.problem}
        </Text>
      )}
    </View>
  );
}

export function PeopleLink({
  itemId,
  access,
}: {
  readonly itemId: string;
  readonly access: DriveAccess;
}): ReactNode {
  const publicUrl = useSettings().public_url;
  const link = peopleLinkOf(itemId, publicUrl, createURL(`/drive/open/${itemId}`));
  return (
    <View className="gap-1">
      <CopyField label="Link for people in the home" value={link} />
      <Text variant="caption" tone="variant">
        {peopleLinkLineOf(access)}
      </Text>
    </View>
  );
}
