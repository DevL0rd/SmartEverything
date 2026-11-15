import type { ReactNode, Ref, RefObject } from 'react';
import type { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import type { MenuItem } from '../../../components/menu';
import { useProfiles } from '../../../store/people';
import { startCall } from '../call';
import { ProfileSwitcher } from '../../profiles';
import { useAssistantName } from '../data/assistant-data';
import { chatMenuItems } from './chat-header-menu';
import { MachineButton, machineMenuItem, type MachineControl } from './chat-machine-control';

export interface PanelToggle {
  readonly docked: boolean;
  readonly open: boolean;
  readonly toggle: () => void;
}

export function ProfileAction(): ReactNode {
  return useProfiles().length > 1 ? <ProfileSwitcher compact /> : null;
}

export function CallAction({ chatId }: { readonly chatId: string | null }): ReactNode {
  const name = useAssistantName();
  return (
    <IconButton
      icon="phone"
      label={`Call ${name}`}
      onPress={() => {
        startCall(chatId === null ? { source: 'chat' } : { source: 'chat', chatId });
      }}
    />
  );
}

function browserToggleLabel(panel: PanelToggle): string {
  if (!panel.open) return 'Browser';
  return panel.docked ? 'Close browser' : 'Back to chat';
}

function browserMenuItem(panel: PanelToggle): MenuItem {
  return {
    id: 'browser',
    label: browserToggleLabel(panel),
    icon: 'globe',
    shortcut: 'Ctrl I',
    onPress: panel.toggle,
  };
}

export function ChatTrailing({
  chatId,
  machine,
  anchor,
  panel,
  browserInMenu,
  phone,
  toggleRef,
}: {
  readonly chatId: string;
  readonly machine: MachineControl;
  readonly anchor: RefObject<View | null>;
  readonly panel: PanelToggle | null;
  readonly browserInMenu: boolean;
  readonly phone: boolean;
  readonly toggleRef: Ref<View> | undefined;
}): ReactNode {
  return (
    <>
      <ProfileAction />
      {phone ? null : <MachineButton control={machine} anchor={anchor} />}
      <CallAction chatId={chatId} />
      {machine.panel}
      {panel !== null && !browserInMenu ? (
        <IconButton
          {...(toggleRef === undefined ? {} : { ref: toggleRef })}
          icon={panel.open ? 'close' : 'globe'}
          label={browserToggleLabel(panel)}
          shortcut="Ctrl I"
          selected={panel.open}
          onPress={panel.toggle}
        />
      ) : null}
    </>
  );
}

export function overflowOf(
  chatId: string,
  phone: boolean,
  machine: MachineControl,
  browser: PanelToggle | null,
): readonly MenuItem[] {
  const menu = chatMenuItems(chatId);
  if (!phone) return menu;
  return [machineMenuItem(machine), ...(browser === null ? [] : [browserMenuItem(browser)]), ...menu];
}
