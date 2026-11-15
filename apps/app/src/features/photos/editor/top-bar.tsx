import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';

export interface EditorActionsProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly busy: boolean;
  readonly canSaveVersion: boolean;
  readonly compare: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCompare: (on: boolean) => void;
  readonly onSave: (mode: 'version' | 'copy') => void;
}

export interface EditorShellProps {
  readonly title: string;
  readonly onCancel: () => void;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}

export function EditorShell({ title, onCancel, trailing, children }: EditorShellProps): ReactNode {
  const phone = useIsPhone();
  return (
    <PageShell
      variant="overlay"
      title={title}
      back={false}
      leading={[{ icon: 'close', label: 'Cancel', shortcut: 'Esc', onPress: onCancel }]}
      heading={
        phone ? (
          <View />
        ) : (
          <Text variant="label" numberOfLines={1}>
            {title}
          </Text>
        )
      }
      trailing={trailing}
    >
      <View className="min-h-0 flex-1 pt-safe-offset-14">
        {phone ? (
          <Text variant="label" align="center" numberOfLines={1} className="px-4 pb-1">
            {title}
          </Text>
        ) : null}
        {children}
      </View>
    </PageShell>
  );
}

export interface SplitSaveProps {
  readonly label: string;
  readonly saving: boolean;
  readonly disabled: boolean;
  readonly more: readonly MenuItem[];
  readonly onSave: () => void;
}

function MoreWays({
  items,
  disabled,
}: {
  readonly items: readonly MenuItem[];
  readonly disabled: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'More ways to save');
  return (
    <>
      <View className={cn('h-5 w-px', disabled ? 'bg-outline-variant' : 'bg-on-primary/40')} />
      <View ref={ref} collapsable={false}>
        <Interactive
          label="More ways to save"
          disabled={disabled}
          onPress={open}
          className="min-h-touch-min min-w-touch-min items-center justify-center pr-1"
          layerClassName="rounded-r-full"
        >
          <Icon name="chevronDown" size={18} tone={disabled ? 'variant' : 'onPrimary'} />
        </Interactive>
      </View>
      {menu}
    </>
  );
}

export function SplitSave({ label, saving, disabled, more, onSave }: SplitSaveProps): ReactNode {
  const off = disabled || saving;
  return (
    <View
      className={cn('flex-row items-center rounded-full', disabled ? 'bg-surface-3' : 'bg-primary')}
    >
      <Interactive
        label={label}
        disabled={off}
        onPress={onSave}
        className={cn(
          'min-h-touch-min flex-row items-center gap-2 pl-4',
          more.length === 0 ? 'pr-4' : 'pr-3',
        )}
        layerClassName={more.length === 0 ? 'rounded-full' : 'rounded-l-full'}
      >
        {saving ? <ActivityIndicator size="small" colorClassName="accent-on-primary" /> : null}
        <Text variant="label" tone={disabled ? 'variant' : 'onPrimary'}>
          {label}
        </Text>
      </Interactive>
      {more.length === 0 ? null : <MoreWays items={more} disabled={off} />}
    </View>
  );
}

function Compare({
  on,
  disabled,
  onChange,
}: {
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onChange: (on: boolean) => void;
}): ReactNode {
  return (
    <Interactive
      label="Hold to compare with the original"
      selected={on}
      disabled={disabled}
      onPressIn={() => {
        onChange(true);
      }}
      onPressOut={() => {
        onChange(false);
      }}
      className="size-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <Icon name="eye" size={24} tone={on ? 'primary' : 'default'} />
    </Interactive>
  );
}

function SaveActions(props: EditorActionsProps): ReactNode {
  const off = !props.dirty || (props.busy && !props.saving);
  if (!props.canSaveVersion) {
    return (
      <SplitSave
        label="Save as copy"
        saving={props.saving}
        disabled={off}
        more={[]}
        onSave={() => {
          props.onSave('copy');
        }}
      />
    );
  }
  return (
    <SplitSave
      label="Save"
      saving={props.saving}
      disabled={off}
      more={[
        {
          label: 'Save as copy',
          description: 'Keeps this photo as it is',
          icon: 'copy',
          onPress: (): void => {
            props.onSave('copy');
          },
        },
      ]}
      onSave={() => {
        props.onSave('version');
      }}
    />
  );
}

export function EditorActions(props: EditorActionsProps): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon="undo"
        label="Undo"
        disabled={!props.canUndo || props.busy}
        onPress={props.onUndo}
      />
      <IconButton
        icon="redo"
        label="Redo"
        disabled={!props.canRedo || props.busy}
        onPress={props.onRedo}
      />
      <Compare on={props.compare} disabled={props.busy} onChange={props.onCompare} />
      <SaveActions {...props} />
    </View>
  );
}
