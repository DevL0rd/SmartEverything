import { useState, type ReactNode } from 'react';
import type { StartupEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { Disclosure } from '../../../components/disclosure';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useRevealed } from '../../../components/show-more';
import { Skeleton } from '../../../components/skeleton';
import { useStartup, useStartupChange } from '../data/computer-system';

type Change = ReturnType<typeof useStartupChange>;

function StartupRows({
  entries,
  offline,
  change,
  guarded,
}: {
  readonly entries: readonly StartupEntry[];
  readonly offline: boolean;
  readonly change: Change;
  readonly guarded: boolean;
}): ReactNode {
  const { shown, more } = useRevealed(entries);
  const asked = change.isPending ? change.variables : undefined;
  const apply = (entry: StartupEntry, enabled: boolean): void => {
    const toggle = { id: entry.id, name: entry.name, enabled };
    if (!guarded || enabled) {
      change.mutate(toggle);
      return;
    }
    background(
      confirm({
        title: `Stop ${entry.name} starting at login?`,
        body: 'It is part of the computer’s own setup. The computer may behave differently at the next sign-in.',
        confirmLabel: 'Turn off',
        tone: 'destructive',
      }).then((accepted) => {
        if (accepted) change.mutate(toggle);
      }),
      'computer_system.confirm_failed',
    );
  };
  return (
    <>
      <List>
        {shown.map((entry) => (
          <SwitchRow
            key={entry.id}
            title={entry.name}
            value={asked?.id === entry.id ? asked.enabled : entry.enabled}
            disabled={offline || asked?.id === entry.id}
            onChange={(enabled) => {
              apply(entry, enabled);
            }}
          />
        ))}
      </List>
      {more}
    </>
  );
}

function SystemStartup({
  entries,
  offline,
  change,
}: {
  readonly entries: readonly StartupEntry[];
  readonly offline: boolean;
  readonly change: Change;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      label={
        open ? 'Hide system startup apps' : `Show ${String(entries.length)} system startup apps`
      }
      open={open}
      hint="Apps set up for everyone on this computer. Turning one off asks first."
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <StartupRows entries={entries} offline={offline} change={change} guarded />
    </Disclosure>
  );
}

export function StartupSection({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const startup = useStartup(deviceId, !offline);
  const change = useStartupChange(deviceId);
  if (startup.isError) {
    return (
      <ErrorState
        error={startup.error}
        retry={() => {
          background(startup.refetch(), 'computer_system.startup_refetch_failed');
        }}
      />
    );
  }
  if (startup.data === undefined) return offline ? null : <Skeleton shape="block" />;
  const yours = startup.data.entries.filter((entry) => !entry.global);
  const system = startup.data.entries.filter((entry) => entry.global);
  return (
    <>
      {yours.length === 0 ? null : (
        <List title="Startup apps" footer="Apps that open when you sign in to the computer.">
          <StartupRows entries={yours} offline={offline} change={change} guarded={false} />
        </List>
      )}
      {system.length === 0 ? null : (
        <SystemStartup entries={system} offline={offline} change={change} />
      )}
    </>
  );
}
