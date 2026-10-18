import type { ReactNode } from 'react';
import { NavRow, ValueRow } from '../../../components/rows';
import type { DesktopTalkShortcuts } from '@smarteverything/domain';
import { useConfigureDesktopTalk, useDesktopTalk, type DesktopTalkStatus } from '../../talk';

const NOT_SET = 'Not set';

interface ShortcutText {
  readonly title: string;
  readonly subtitle: string;
}

const TALK: ShortcutText = {
  title: 'Talk to the AI shortcut',
  subtitle: 'Starts or ends a voice conversation from anywhere. Hold to talk.',
};

const MUTE: ShortcutText = {
  title: 'Mute the AI call shortcut',
  subtitle: 'Mutes or unmutes the call from anywhere.',
};

function shortcutValue(
  desktop: DesktopTalkStatus,
  pick: (shortcuts: DesktopTalkShortcuts) => string | null,
): string {
  if (desktop.status === 'ready') {
    return pick(desktop.shortcuts) ?? NOT_SET;
  }
  if (desktop.status === 'outdated') {
    return 'Update the desktop app';
  }
  return desktop.status === 'failed' ? desktop.reason : '';
}

function ShortcutRow({
  text,
  pick,
}: {
  readonly text: ShortcutText;
  readonly pick: (shortcuts: DesktopTalkShortcuts) => string | null;
}): ReactNode {
  const desktop = useDesktopTalk();
  const configure = useConfigureDesktopTalk();
  const value = shortcutValue(desktop, pick);
  const changeable = desktop.status === 'ready' && desktop.shortcuts.backend === 'portal';
  const row = { ...text, icon: 'keyboard', value, wrapSubtitle: true } as const;
  return changeable ? <NavRow {...row} onPress={configure} /> : <ValueRow {...row} />;
}

export function TalkShortcutRow(): ReactNode {
  return <ShortcutRow text={TALK} pick={(shortcuts) => shortcuts.assistant} />;
}

export function MuteShortcutRow(): ReactNode {
  return <ShortcutRow text={MUTE} pick={(shortcuts) => shortcuts.assistantMute} />;
}
