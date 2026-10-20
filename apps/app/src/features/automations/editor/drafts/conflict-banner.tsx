import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { STATUS_CONTAINER } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { useMinute } from '../../../../store/clock';
import type { TheirRevision } from './draft-sync-model';
import { conflictCopy } from './sync-copy';

export interface ConflictBannerProps {
  readonly conflict: TheirRevision;
  readonly by: string;
  readonly timeZone: string | null;
  readonly narrow: boolean;
  readonly onCompare: () => void;
  readonly onKeepMine: () => void;
  readonly onUseTheirs: () => void;
}

export function ConflictBanner({
  conflict,
  by,
  timeZone,
  narrow,
  onCompare,
  onKeepMine,
  onUseTheirs,
}: ConflictBannerProps): ReactNode {
  const now = useMinute();
  const copy = conflictCopy(by, conflict.savedAt, now, timeZone);
  const actions = (
    <View className={cn('flex-row items-center gap-2', narrow ? 'w-full' : 'shrink-0')}>
      <Button label="Compare" variant="text" onPress={onCompare} />
      <Button label="Keep my draft" variant="filled" grow={narrow} onPress={onKeepMine} />
      <Button label="Use theirs" variant="outlined" grow={narrow} onPress={onUseTheirs} />
    </View>
  );
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'max-h-35 gap-2 rounded-lg px-4 py-2',
        narrow ? '' : 'flex-row items-center gap-3',
        STATUS_CONTAINER.warning,
      )}
    >
      <View className="min-w-0 flex-1 flex-row items-start gap-3">
        <Icon name="warning" size={20} tone="warning" />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={narrow ? 1 : 2}>
            {copy.title}
          </Text>
          <Text variant="callout" tone="variant">
            {copy.caption}
          </Text>
        </View>
      </View>
      {actions}
    </View>
  );
}
