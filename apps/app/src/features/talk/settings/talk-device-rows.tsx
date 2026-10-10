import type { ReactNode } from 'react';
import { setHeadsetButton } from '../../../../modules/health-connect';
import { ActionRow, SelectRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { chooseTalkChannel, useTalkChannelId } from '../data/talk-channel';
import { useMyChannels } from '../data/talk-data';
import { turnTalkOff, turnTalkOn } from '../data/talk-device';
import {
  configureDesktopTalk,
  useDesktopTalk,
  type DesktopTalkStatus,
} from '../desktop/use-talk-shortcuts';

const MODES = [
  { value: 'hold', label: 'Hold to talk' },
  { value: 'tap', label: 'Tap to start and stop' },
] as const;

function HeadsetRow(): ReactNode {
  const on = useLocalPref('talkHeadset');
  return (
    <SwitchRow
      title="Headset button talks"
      subtitle="Press your earbuds’ button to start and stop talking"
      icon="music"
      value={on}
      onChange={(next) => {
        setHeadsetButton(next).then(
          () => {
            setLocalPref('talkHeadset', next);
          },
          (error: unknown) => {
            notify({ message: 'Headset button not changed', error, tone: 'critical' });
          },
        );
      }}
    />
  );
}

function shortcutRows(desktop: DesktopTalkStatus): ReactNode[] {
  if (desktop.status === 'outdated' || desktop.status === 'failed') {
    const value = desktop.status === 'outdated' ? 'Update the desktop app' : desktop.reason;
    return [<ValueRow key="shortcuts" title="Shortcuts" icon="keyboard" value={value} />];
  }
  if (desktop.status !== 'ready') {
    return [];
  }
  const { shortcuts } = desktop;
  return [
    <ValueRow
      key="talk"
      title={shortcuts.hold ? 'Talk (hold)' : 'Talk (press to start and stop)'}
      icon="keyboard"
      value={shortcuts.talk ?? 'Not set'}
    />,
    <ValueRow
      key="next"
      title="Next channel"
      icon="keyboard"
      value={shortcuts.next ?? 'Not set'}
    />,
    ...(shortcuts.problem === null
      ? []
      : [<ValueRow key="problem" title="Shortcuts" value={shortcuts.problem} />]),
    ...(shortcuts.backend === 'portal'
      ? [
          <ActionRow
            key="change"
            title="Change shortcuts"
            icon="pencil"
            onPress={configureDesktopTalk}
          />,
        ]
      : []),
  ];
}

export function TalkDeviceRows(): ReactNode {
  const enabled = useLocalPref('talkEnabled');
  const mode = useLocalPref('talkMode');
  const channels = useMyChannels();
  const talkChannel = useTalkChannelId();
  const platform = appPlatform();
  const desktop = useDesktopTalk();
  return (
    <List title="This device" inset>
      <SwitchRow
        title="Walkie-talkie"
        subtitle="Works in the background"
        icon="power"
        value={enabled}
        onChange={(next) => {
          if (next) {
            void turnTalkOn();
          } else {
            turnTalkOff();
          }
        }}
      />
      <SelectRow
        title="Talk button"
        icon="mic"
        options={MODES}
        value={mode}
        onChange={(next) => {
          setLocalPref('talkMode', next);
        }}
      />
      <SelectRow
        title="Talk channel"
        subtitle="Used by shortcuts"
        icon="signal"
        options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
        value={talkChannel}
        placeholder="None yet"
        disabled={channels.length === 0}
        onChange={chooseTalkChannel}
      />
      {platform === 'android' ? <HeadsetRow /> : null}
      {platform === 'desktop' ? shortcutRows(desktop) : null}
    </List>
  );
}
