import type { ReactNode } from 'react';
import type { MachineUpdateStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useUpdateStatus, type UpdateReading } from '../../../api/desktop-update';
import { ListRow } from '../../../components/list-row';
import { ActionRow, ValueRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import type { DesktopBridge } from '../../../design/platform';
import { requestDesktopInstall, useDesktopInstallBlock } from '../data/desktop-install-action';
import { updateRowOf } from '../model/desktop-install-row';

const log = new Logger('app.app-updates');

type Run = (work: () => Promise<MachineUpdateStatus>, failure: string) => void;

interface Calls {
  readonly check: () => Promise<MachineUpdateStatus>;
  readonly install: (expectedOfferId: string) => Promise<MachineUpdateStatus>;
}

function restoreOpener(): () => void {
  const opener = document.activeElement;
  return (): void => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
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
  manualCheck,
}: {
  readonly status: MachineUpdateStatus;
  readonly calls: Calls;
  readonly run: Run;
  readonly manualCheck: boolean;
}): ReactNode {
  const row = updateRowOf(status);
  const blocked = useDesktopInstallBlock();
  if (row.kind === 'info') {
    return <ValueRow icon="download" title={row.title} value={row.value} subtitle={row.subtitle} />;
  }
  if (row.act === 'check' && !manualCheck) {
    return (
      <ListRow
        icon="download"
        title="Installer status"
        {...(status.state === 'failed' ? { value: 'Check failed' } : {})}
        subtitle={row.subtitle}
      />
    );
  }
  const installBlock = row.act === 'install' ? blocked : null;
  return (
    <ActionRow
      icon={row.act === 'install' ? 'download' : 'refresh'}
      title={row.title}
      subtitle={installBlock ?? row.subtitle}
      disabled={installBlock !== null}
      onPress={() => {
        if (row.act === 'check') {
          run(calls.check, 'Updates couldn’t be checked');
          return;
        }
        const { offerId, version } = status;
        if (offerId === undefined || version === null) return;
        requestDesktopInstall(calls.install, { version, id: offerId }, restoreOpener()).catch(
          notifyFailure('The update didn’t start'),
        );
      }}
    />
  );
}

export function DesktopInstallerRows({
  bridge,
  manualCheck = true,
}: {
  readonly bridge: DesktopBridge;
  readonly manualCheck?: boolean;
}): ReactNode {
  const { reading, apply } = useUpdateStatus(bridge);
  const check = bridge.checkForUpdate.bind(bridge);
  const install = bridge.installUpdate.bind(bridge);
  if (reading.kind !== 'read') return <Unread reading={reading} />;
  const run: Run = (work, failure) => {
    const operation = log.operation('desktop_update.check', {});
    work().then(
      (status) => {
        operation.succeeded();
        apply(status);
      },
      (error: unknown) => {
        operation.failed(error);
        notifyFailure(failure)(error);
      },
    );
  };
  const installAndApply: Calls['install'] = async (id) => {
    const status = await install(id);
    apply(status);
    return status;
  };
  return (
    <Update
      status={reading.status}
      calls={{ check, install: installAndApply }}
      run={run}
      manualCheck={manualCheck}
    />
  );
}
