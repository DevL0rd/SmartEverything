import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc } from '../../../components/charts';
import { FlatChoice } from '../../../components/flat-choice';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { isNative } from '../../../design/platform';
import { useLiveProgress } from '../backup/live';
import { useBackupStatus } from '../backup/model/status';
import { hubChipOf, phoneChipOf, type ChipView } from '../backup/phones-model';
import { usePhotoBackupState } from '../data';

const MARK_SIZE = 16;

export const NOT_BACKED_UP = 'Not backed up';

function Mark({ view }: { readonly view: ChipView }): ReactNode {
  if (view.mark === 'check') return <Icon name="check" size={MARK_SIZE} tone="positive" />;
  if (view.mark === 'pause') return <Icon name="pause" size={MARK_SIZE} tone="warning" />;
  return (
    <View className="size-4">
      <Arc value={view.progress} size={MARK_SIZE} thickness={2} colour="primary" />
    </View>
  );
}

export function BackupChipFace({
  view,
  iconOnly,
}: {
  readonly view: ChipView;
  readonly iconOnly: boolean;
}): ReactNode {
  return (
    <Interactive
      href={href.photosPage('backup')}
      label={`Backup: ${view.label}`}
      className={cn(
        'h-control-h flex-row items-center justify-center rounded-full',
        iconOnly ? 'w-control-h' : 'gap-2 bg-surface-3 px-3',
      )}
      layerClassName="rounded-full"
    >
      <Mark view={view} />
      {iconOnly ? null : (
        <Text variant="footnote" numberOfLines={1} className="tabular-nums">
          {view.label}
        </Text>
      )}
    </Interactive>
  );
}

interface ChipProps {
  readonly iconOnly: boolean;
}

function HubChip({ iconOnly }: ChipProps): ReactNode {
  const states = usePhotoBackupState().data;
  const view = hubChipOf(states, useLiveProgress());
  return view === null ? null : <BackupChipFace view={view} iconOnly={iconOnly} />;
}

function PhoneChip({ iconOnly }: ChipProps): ReactNode {
  const view = phoneChipOf(useBackupStatus());
  return view === null ? null : <BackupChipFace view={view} iconOnly={iconOnly} />;
}

export function BackupChip({ iconOnly = false }: { readonly iconOnly?: boolean }): ReactNode {
  return isNative() ? <PhoneChip iconOnly={iconOnly} /> : <HubChip iconOnly={iconOnly} />;
}

export function NotBackedUpChip({
  count,
  active,
  onPress,
}: {
  readonly count: number;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  if (!isNative() || (count === 0 && !active)) return null;
  return (
    <FlatChoice
      label={NOT_BACKED_UP}
      count={count}
      role="radio"
      active={active}
      onPress={onPress}
    />
  );
}
