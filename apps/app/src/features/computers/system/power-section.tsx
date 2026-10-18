import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { isHub, offersAction, useComputerCommand } from '../data/computer-device';
import { menuEntries, type MenuEntry, type MenuKey } from '../model/computer-menu';

const POWER_KEYS: readonly MenuKey[] = ['wake', 'hibernate', 'restart', 'shut_down', 'sign_out'];

interface QuickAction {
  readonly capability: string;
  readonly label: string;
  readonly icon: IconName;
  readonly ask?: (name: string) => { title: string; body: string; confirmLabel: string };
}

const QUICK: readonly QuickAction[] = [
  { capability: 'lock_screen', label: 'Lock', icon: 'lock' },
  { capability: 'sleep', label: 'Sleep', icon: 'bed' },
];

const REMOTE: readonly QuickAction[] = [
  { capability: 'ring', label: 'Ring', icon: 'bell' },
  { capability: 'stop_ring', label: 'Stop ringing', icon: 'bellOff' },
  {
    capability: 'unlock',
    label: 'Unlock',
    icon: 'lockOpen',
    ask: (name) => ({
      title: `Unlock ${name}?`,
      body: 'Anyone at the computer can use it once it is unlocked.',
      confirmLabel: 'Unlock',
    }),
  },
];

function ask(entry: MenuEntry, run: () => void): void {
  const { confirm: request } = entry;
  if (request === null) {
    run();
    return;
  }
  background(
    confirm({
      title: request.title,
      body: request.body,
      confirmLabel: request.confirmLabel,
      tone: request.destructive ? 'destructive' : 'default',
    }).then((accepted) => {
      if (accepted) run();
    }),
    'computer_system.confirm_failed',
  );
}

function quickRun(action: QuickAction, name: string, run: Run): void {
  const request = action.ask?.(name);
  if (request === undefined) {
    run(action.capability, null);
    return;
  }
  background(
    confirm(request).then((accepted) => {
      if (accepted) run(action.capability, null);
    }),
    'computer_system.confirm_failed',
  );
}

function powerEntries(device: Device, hub: boolean): readonly MenuEntry[] {
  return menuEntries({
    name: device.label,
    offline: !device.online,
    offers: (capability) => offersAction(device, capability),
    owner: false,
    canRevoke: false,
    hub,
  }).filter((entry) => POWER_KEYS.includes(entry.key));
}

type Run = ReturnType<typeof useComputerCommand>;

function EntryRow({ entry, run }: { readonly entry: MenuEntry; readonly run: Run }): ReactNode {
  return (
    <ListRow
      title={entry.label}
      icon={entry.icon}
      destructive={entry.key === 'shut_down'}
      onPress={() => {
        ask(entry, () => {
          run(entry.key, null);
        });
      }}
    />
  );
}

function PowerLists({
  quick,
  entries,
  run,
}: {
  readonly quick: readonly QuickAction[];
  readonly entries: readonly MenuEntry[];
  readonly run: Run;
}): ReactNode {
  const gentle = entries.filter((entry) => !entry.destructive);
  const heavy = entries.filter((entry) => entry.destructive);
  return (
    <>
      {quick.length === 0 && gentle.length === 0 ? null : (
        <List title="Power">
          {quick.map((action) => (
            <ListRow
              key={action.capability}
              title={action.label}
              icon={action.icon}
              onPress={() => {
                run(action.capability, null);
              }}
            />
          ))}
          {gentle.map((entry) => (
            <EntryRow key={entry.key} entry={entry} run={run} />
          ))}
        </List>
      )}
      {heavy.length === 0 ? null : (
        <List title="Restart and shut down" footer="Each one asks you to confirm first.">
          {heavy.map((entry) => (
            <EntryRow key={entry.key} entry={entry} run={run} />
          ))}
        </List>
      )}
    </>
  );
}

function RemoteList({
  actions,
  name,
  run,
}: {
  readonly actions: readonly QuickAction[];
  readonly name: string;
  readonly run: Run;
}): ReactNode {
  if (actions.length === 0) return null;
  return (
    <List title="Find and unlock">
      {actions.map((action) => (
        <ListRow
          key={action.capability}
          title={action.label}
          icon={action.icon}
          onPress={() => {
            quickRun(action, name, run);
          }}
        />
      ))}
    </List>
  );
}

export function PowerSection({ device }: { readonly device: Device }): ReactNode {
  const run = useComputerCommand(device);
  const hub = isHub(device);
  const quick = device.online
    ? QUICK.filter(
        (action) =>
          offersAction(device, action.capability) && !(hub && action.capability === 'sleep'),
      )
    : [];
  const remote = device.online
    ? REMOTE.filter((action) => offersAction(device, action.capability))
    : [];
  const entries = powerEntries(device, hub);
  const offline = device.online ? null : (
    <ReasonLine
      icon="info"
      text={`${device.label} is offline. Power actions are paused until it is back.`}
    />
  );
  return (
    <>
      {offline}
      {quick.length === 0 && entries.length === 0 ? null : (
        <PowerLists quick={quick} entries={entries} run={run} />
      )}
      <RemoteList actions={remote} name={device.label} run={run} />
    </>
  );
}
