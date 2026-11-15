import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { useSyncStatus } from '../../../store/selectors';
import type { FolderBackup } from './backup';
import { backupStateLine } from './backup-model';
import { useFolderHiding } from './data';
import type { FolderView } from './model';

export function useHideAction(): (folder: Pick<FolderView, 'key' | 'name' | 'hidden'>) => void {
  const hide = useFolderHiding();
  return (folder) => {
    background(
      hide({ key: folder.key, name: folder.name, hidden: !folder.hidden }).catch(
        (error: unknown) => {
          notify({
            message: folder.hidden ? 'The folder was not shown' : 'The folder was not hidden',
            error,
            tone: 'critical',
          });
        },
      ),
      'photos.folders.hide_failed',
    );
  };
}

interface PillProps {
  readonly on: boolean;
  readonly icon: IconName;
  readonly text: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly fill: boolean;
  readonly iconOnly?: boolean;
  readonly onPress: () => void;
}

function pillClass({
  on,
  disabled,
  fill,
  iconOnly,
}: Pick<PillProps, 'on' | 'fill'> & {
  readonly disabled: boolean;
  readonly iconOnly: boolean;
}): string {
  return cn(
    'h-control-h min-w-0 flex-row items-center justify-center gap-2 rounded-full',
    iconOnly ? 'w-control-h' : 'px-3',
    fill && 'flex-1',
    on ? 'bg-primary-container' : 'bg-surface-3',
    disabled && 'opacity-40',
  );
}

function TogglePill({
  on,
  icon,
  text,
  label,
  disabled = false,
  fill,
  iconOnly = false,
  onPress,
}: PillProps): ReactNode {
  return (
    <Interactive
      role="switch"
      checked={on}
      label={label}
      disabled={disabled}
      onPress={onPress}
      className={pillClass({ on, disabled, fill, iconOnly })}
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={iconOnly ? 20 : 16} tone={on ? 'primary' : 'variant'} />
      {iconOnly ? null : (
        <Text
          variant="footnote"
          tone={on ? 'primary' : 'default'}
          numberOfLines={1}
          className="min-w-0 shrink"
        >
          {text}
        </Text>
      )}
    </Interactive>
  );
}

function BackupPill({
  folder,
  backupId,
  backup,
}: {
  readonly folder: FolderView;
  readonly backupId: string;
  readonly backup: FolderBackup;
}): ReactNode {
  const on = backup.on(backupId);
  const live = useSyncStatus().status === 'live';
  return (
    <TogglePill
      on={on}
      icon={on ? 'cloud' : 'cloudOff'}
      text={backup.choice === null ? 'Backup' : backupStateLine(backup.choice, backupId)}
      label={`Back up ${folder.name}`}
      disabled={backup.choice === null || !live}
      fill
      onPress={() => {
        backup.set({ backupId, name: folder.name }, !on);
      }}
    />
  );
}

export function ShownPill({
  folder,
  fill,
  iconOnly = false,
}: {
  readonly folder: FolderView;
  readonly fill: boolean;
  readonly iconOnly?: boolean;
}): ReactNode {
  const hide = useHideAction();
  const shown = !folder.hidden;
  const live = useSyncStatus().status === 'live';
  return (
    <TogglePill
      on={shown}
      icon={shown ? 'eye' : 'eyeOff'}
      text={shown ? 'Shown' : 'Hidden'}
      label={`Show ${folder.name} in Photos`}
      disabled={!live}
      fill={fill}
      iconOnly={iconOnly}
      onPress={() => {
        hide(folder);
      }}
    />
  );
}

export function FolderToggles({
  folder,
  backup,
}: {
  readonly folder: FolderView;
  readonly backup: FolderBackup;
}): ReactNode {
  const pair = folder.backupId !== null;
  return (
    <View className={cn('flex-row gap-2', !pair && 'justify-end')}>
      {folder.backupId === null ? null : (
        <BackupPill folder={folder} backupId={folder.backupId} backup={backup} />
      )}
      <ShownPill folder={folder} fill={pair} />
    </View>
  );
}
