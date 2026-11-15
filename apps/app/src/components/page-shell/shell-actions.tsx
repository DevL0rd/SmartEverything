import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { AppHref } from '../app-href';
import { Button } from '../button';
import { useHeaderPinItems } from '../header-pin';
import { useHeaderStatus } from '../header-status';
import type { IconName } from '../icon';
import { IconButton } from '../icon-button';
import { OverflowButton, type MenuItem } from '../menu';
import { PageSettingsButton, type PageSettingsLink } from '../page-settings-button';
import { usePrimaryActionPlacement, type PrimaryActionProps } from '../primary-action';

export interface ShellAction {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: AppHref;
  readonly primary?: boolean;
  readonly selected?: boolean;
  readonly shortcut?: string;
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
}

export interface ShellEditing {
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly dirty: boolean;
}

export type ShellActionsKind = 'touch' | 'pointer';

export interface ShellActionsProps {
  readonly kind: ShellActionsKind;
  readonly actions?: readonly ShellAction[] | undefined;
  readonly overflow?: readonly MenuItem[] | undefined;
  readonly settings?: PageSettingsLink | undefined;
  readonly editing?: ShellEditing | null | undefined;
  readonly primaryAction?: PrimaryActionProps | undefined;
  readonly compact?: boolean;
}

export const TOUCH_ACTION_LIMIT = 2;

const NO_ACTIONS: readonly ShellAction[] = [];

const NO_ITEMS: readonly MenuItem[] = [];

type LateItems = (() => readonly MenuItem[]) | null;

export type TouchMenu =
  | { readonly kind: 'none' }
  | { readonly kind: 'settings'; readonly settings: PageSettingsLink }
  | { readonly kind: 'menu'; readonly items: readonly MenuItem[] };

function pressHandlerOf(action: ShellAction): () => void {
  const { href, onPress } = action;
  if (onPress !== undefined) return onPress;
  if (href !== undefined) {
    return (): void => {
      router.push(href);
    };
  }
  return (): void => undefined;
}

function settingsItemOf(settings: PageSettingsLink): MenuItem {
  return {
    label: settings.label,
    icon: 'settings',
    onPress: (): void => {
      router.push(settings.href);
    },
  };
}

export function touchMenuOf(
  actions: readonly ShellAction[],
  overflow: readonly MenuItem[],
  settings: PageSettingsLink | undefined,
  late: boolean,
): TouchMenu {
  const rest: readonly MenuItem[] = [
    ...actions.slice(TOUCH_ACTION_LIMIT).map((action) => ({
      label: action.label,
      icon: action.icon,
      disabled: action.disabled ?? false,
      onPress: pressHandlerOf(action),
    })),
    ...overflow,
  ];
  const empty = rest.length === 0 && !late;
  if (settings === undefined) return empty ? { kind: 'none' } : { kind: 'menu', items: rest };
  if (empty) return { kind: 'settings', settings };
  return { kind: 'menu', items: [...rest, settingsItemOf(settings)] };
}

function TouchMenuButton({
  menu,
  late,
}: {
  readonly menu: TouchMenu;
  readonly late: LateItems;
}): ReactNode {
  if (menu.kind === 'none') return null;
  if (menu.kind === 'settings') return <PageSettingsButton settings={menu.settings} />;
  return <OverflowButton items={menu.items} late={late} />;
}

function pressOf(action: ShellAction): {
  readonly disabled: boolean;
  readonly onPress?: () => void;
  readonly href?: AppHref;
} {
  return {
    disabled: action.disabled ?? false,
    ...(action.onPress === undefined ? {} : { onPress: action.onPress }),
    ...(action.href === undefined ? {} : { href: action.href }),
  };
}

function ActionIcon({ action }: { readonly action: ShellAction }): ReactNode {
  return (
    <IconButton
      icon={action.icon}
      label={action.label}
      selected={action.selected ?? false}
      {...(action.shortcut === undefined ? {} : { shortcut: action.shortcut })}
      {...pressOf(action)}
    />
  );
}

function TouchActions({
  actions,
  overflow,
  settings,
  primaryAction,
  late,
}: {
  readonly actions: readonly ShellAction[];
  readonly overflow: readonly MenuItem[];
  readonly settings: PageSettingsLink | undefined;
  readonly primaryAction: PrimaryActionProps | undefined;
  readonly late: LateItems;
}): ReactNode {
  const placed = usePrimaryActionPlacement() === 'header' ? primaryAction : undefined;
  return (
    <View className="flex-row items-center">
      {placed === undefined ? null : (
        <IconButton icon={placed.icon} label={placed.label} onPress={placed.onPress} />
      )}
      {actions.slice(0, TOUCH_ACTION_LIMIT).map((action) => (
        <ActionIcon key={action.label} action={action} />
      ))}
      <TouchMenuButton menu={touchMenuOf(actions, overflow, settings, late !== null)} late={late} />
    </View>
  );
}

function PointerAction({
  action,
  compact,
}: {
  readonly action: ShellAction;
  readonly compact: boolean;
}): ReactNode {
  if (action.iconOnly === true || compact) return <ActionIcon action={action} />;
  return (
    <Button
      label={action.label}
      icon={action.icon}
      variant={action.primary === true ? 'filled' : 'tonal'}
      {...pressOf(action)}
    />
  );
}

function PointerActions({
  actions,
  overflow,
  settings,
  primaryAction,
  compact,
  late,
}: {
  readonly actions: readonly ShellAction[];
  readonly overflow: readonly MenuItem[];
  readonly settings: PageSettingsLink | undefined;
  readonly primaryAction: PrimaryActionProps | undefined;
  readonly compact: boolean;
  readonly late: LateItems;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      {actions.map((action) => (
        <PointerAction key={action.label} action={action} compact={compact} />
      ))}
      {primaryAction === undefined ? null : (
        <PointerAction action={{ ...primaryAction, primary: true }} compact={compact} />
      )}
      {overflow.length === 0 && late === null ? null : (
        <OverflowButton items={overflow} late={late} />
      )}
      {settings === undefined ? null : <PageSettingsButton settings={settings} />}
    </View>
  );
}

function EditBar({ editing }: { readonly editing: ShellEditing }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Button label="Cancel" variant="text" onPress={editing.onCancel} />
      <Button label="Done" onPress={editing.onDone} />
    </View>
  );
}

export function ShellActions(props: ShellActionsProps): ReactNode {
  const status = useHeaderStatus();
  const late = useHeaderPinItems();
  if (props.editing !== undefined && props.editing !== null) {
    return <EditBar editing={props.editing} />;
  }
  const actions = props.actions ?? NO_ACTIONS;
  const overflow = props.overflow ?? NO_ITEMS;
  return (
    <View testID="shell-actions" className="shrink-0 flex-row items-center gap-1">
      {status}
      {props.kind === 'pointer' ? (
        <PointerActions
          actions={actions}
          overflow={overflow}
          settings={props.settings}
          primaryAction={props.primaryAction}
          compact={props.compact === true}
          late={late}
        />
      ) : (
        <TouchActions
          actions={actions}
          overflow={overflow}
          settings={props.settings}
          primaryAction={props.primaryAction}
          late={late}
        />
      )}
    </View>
  );
}
