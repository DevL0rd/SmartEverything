import type { ReactNode } from 'react';
import type { MachineUpdateStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useUpdateStatus, type UpdateReading } from '../../../api/desktop-update';
import { confirm } from '../../../components/confirm-store';
import { ActionRow, ValueRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import type { DesktopBridge } from '../../../design/platform';
import { trackConnection } from '../connections-log';
import { updateRowOf } from './app-update-model';

type Run = (work: () => Promise<MachineUpdateStatus>, failure: string) => void;

interface Calls {
  readonly check: () => Promise<MachineUpdateStatus>;
  readonly install: () => Promise<MachineUpdateStatus>;
}

function confirmThenInstall(version: string, install: () => void): void {
  background(
    confirm({
      title: `Update to version ${version}?`,
      body: 'SmartEverything restarts and your home is unavailable for a moment.',
      confirmLabel: 'Update',
    }).then((accepted) => {
      if (accepted) install();
    }),
    'app_update.confirm_failed',
  );
}

function Unread({ reading }: { readonly reading: UpdateReading }): ReactNode {
  return (
    <ValueRow
      icon="download"
      title="App updates"
      value={reading.kind === 'failed' ? 'Unreadable' : 'Reading…'}
      {...(reading.kind === 'failed' ? { subtitle: reading.problem } : {})}
    />
  );
}

function Update({
  status,
  calls,
  run,
}: {
  readonly status: MachineUpdateStatus;
  readonly calls: Calls;
  readonly run: Run;
}): ReactNode {
  const row = updateRowOf(status);
  if (row.kind === 'info') {
    return <ValueRow icon="download" title={row.title} value={row.value} subtitle={row.subtitle} />;
  }
  return (
    <ActionRow
      icon={row.act === 'install' ? 'download' : 'refresh'}
      title={row.title}
      subtitle={row.subtitle}
      onPress={() => {
        if (row.act === 'check') {
          run(calls.check, 'Updates couldn’t be checked');
          return;
        }
        confirmThenInstall(status.version ?? '', () => {
          run(calls.install, 'The update didn’t start');
        });
      }}
    />
  );
}

export function AppUpdateRows({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const { reading, apply } = useUpdateStatus(bridge);
  const check = bridge.checkForUpdate?.bind(bridge);
  const install = bridge.installUpdate?.bind(bridge);
  if (check === undefined || install === undefined) return null;
  if (reading.kind !== 'read') return <Unread reading={reading} />;
  const run: Run = (work, failure) => {
    trackConnection('app_update.run', { failure }, work).then(apply, notifyFailure(failure));
  };
  return <Update status={reading.status} calls={{ check, install }} run={run} />;
}
