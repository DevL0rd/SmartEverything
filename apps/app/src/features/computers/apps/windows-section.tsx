import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WindowRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Section, List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { DemandRegion } from '../../../store/demand-region';
import { StateMissing } from '../components/state-missing';
import { useStateSeed } from '../data/computer-state';
import { useOpenWindows, useWindowChange } from '../data/computer-windows';
import { useScreenshotToChat } from '../files/screenshot';
import { windowLine } from './apps-model';

const TOPICS = ['windows'] as const;
const ROW_ACTIONS_FROM = 600;

interface WindowAction {
  readonly label: string;
  readonly icon: 'externalLink' | 'minimize' | 'camera' | 'close';
  readonly run: () => void;
  readonly disabled: boolean;
  readonly destructive?: boolean;
}

type Change = (action: 'focus' | 'minimise' | 'close') => void;

function nameOf(window: WindowRow, shared: boolean): string {
  if (shared && window.title !== '') return `“${window.title}”`;
  return window.app === null ? 'window' : `${window.app.name} window`;
}

interface ActionContext {
  readonly window: WindowRow;
  readonly name: string;
  readonly online: boolean;
  readonly change: Change;
  readonly shot: ReturnType<typeof useScreenshotToChat>;
}

function actionsOf({ window, name, online, change, shot }: ActionContext): readonly WindowAction[] {
  const front: WindowAction = {
    label: `Bring ${name} to front`,
    icon: 'externalLink',
    run: () => {
      change('focus');
    },
    disabled: !online,
  };
  const minimise: WindowAction = {
    label: `Minimise ${name}`,
    icon: 'minimize',
    run: () => {
      change('minimise');
    },
    disabled: !online,
  };
  const screenshot: WindowAction = {
    label: `Screenshot ${name}`,
    icon: 'camera',
    run: shot.run,
    disabled: shot.reason !== null,
  };
  const close: WindowAction = {
    label: `Close ${name}`,
    icon: 'close',
    run: () => {
      change('close');
    },
    disabled: !online,
    destructive: true,
  };
  return [
    front,
    ...(window.minimised ? [] : [minimise]),
    ...(window.focused ? [screenshot] : []),
    close,
  ];
}

function menuOf(actions: readonly WindowAction[]): readonly MenuItem[] {
  return actions.map((action) => ({
    label: action.label,
    icon: action.icon,
    onPress: action.run,
    disabled: action.disabled,
    ...(action.destructive === true ? { destructive: true } : {}),
  }));
}

function WindowActions({
  actions,
  name,
}: {
  readonly actions: readonly WindowAction[];
  readonly name: string;
}): ReactNode {
  const wide = useAreaWidth() >= ROW_ACTIONS_FROM;
  const [front, ...rest] = actions;
  const showFront = wide && front !== undefined;
  return (
    <View className="flex-row items-center gap-1">
      {showFront ? (
        <Button label="Show" variant="text" disabled={front.disabled} onPress={front.run} />
      ) : null}
      <OverflowButton
        items={menuOf(showFront ? rest : actions)}
        label={`More actions for ${name}`}
      />
    </View>
  );
}

function WindowItem({
  deviceId,
  window,
  shared,
  online,
  shot,
}: {
  readonly deviceId: string;
  readonly window: WindowRow;
  readonly shared: boolean;
  readonly online: boolean;
  readonly shot: ReturnType<typeof useScreenshotToChat>;
}): ReactNode {
  const change = useWindowChange(deviceId);
  const name = nameOf(window, shared);
  const actions = actionsOf({
    window,
    name,
    online,
    change: (action) => {
      change.mutate({ window, action });
    },
    shot,
  });
  return (
    <ListRow
      title={window.title === '' ? (window.app?.name ?? 'Untitled window') : window.title}
      subtitle={windowLine(window)}
      icon="appWindow"
      trailing={<WindowActions actions={actions} name={name} />}
    />
  );
}

export function WindowsSection({
  deviceId,
  online,
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  return (
    <DemandRegion deviceId={deviceId} topics={TOPICS}>
      <WindowList deviceId={deviceId} online={online} />
    </DemandRegion>
  );
}

function WindowList({
  deviceId,
  online,
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  const windows = useOpenWindows(deviceId);
  const shot = useScreenshotToChat(deviceId, 'focused');
  const load = useStateSeed(deviceId, 'windows', online);
  if (windows === undefined) {
    return <StateMissing load={load} offline={!online} loading={<Skeleton shape="block" />} />;
  }
  return (
    <Section title="Open windows" caption={plural(windows.length, 'window')}>
      {windows.length === 0 ? (
        <EmptyState
          compact
          icon="grid"
          title="No open windows"
          body="Apps you open on the computer show up here."
        />
      ) : (
        <List>
          {windows.map((window) => (
            <WindowItem
              key={window.id}
              deviceId={deviceId}
              window={window}
              shared={windows.some(
                (other) => other.id !== window.id && other.app?.id === window.app?.id,
              )}
              online={online}
              shot={shot}
            />
          ))}
        </List>
      )}
    </Section>
  );
}
