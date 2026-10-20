import { Logger, background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerAiStatus,
  type ClaudeStatus,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { ActionRow, NavRow, ValueRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { AttachedCliTools, attachedCliToolsReady } from './attached-cli-tools';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { computerAiKey } from '../../../queries/keys';
import { useNativeStatus } from '../data/computer-ai';

const log = new Logger('app.computers');
type SetupAction = 'link' | 'unlink';

async function setup(deviceId: string, kind: SetupAction): Promise<void> {
  const params = { deviceId };
  const operation = log.operation('claude_link.setup', { deviceId, kind });
  try {
    if (kind === 'link') await api().call(E.installComputerClaudeLink, { params });
    else await api().call(E.removeComputerClaudeLink, { params });
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    throw error;
  }
}

function SetupRows({
  native,
  disabled,
  run,
}: {
  readonly native: ClaudeStatus | undefined;
  readonly disabled: boolean;
  readonly run: (kind: SetupAction) => void;
}): ReactNode {
  return (
    <List
      title="Attached CLI integration"
      footer={
        native?.link.problem ??
        'Optional. Lets Claude sessions you start in the terminal use home tools.'
      }
    >
      <ValueRow
        title="Home tools link"
        value={native?.link.state.replaceAll('_', ' ') ?? 'Unavailable'}
      />
      {(
        [
          { id: 'link', title: 'Install or repair link' },
          { id: 'unlink', title: 'Remove link' },
        ] as const
      ).map((item) => (
        <ActionRow
          key={item.id}
          title={item.title}
          disabled={disabled}
          onPress={() => {
            run(item.id);
          }}
        />
      ))}
    </List>
  );
}

export function NativeSetup({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const native = useNativeStatus(
    status.device_id,
    status.online && status.settings.control.enabled,
  );
  const client = useQueryClient();
  const [tools, showTools] = useState(false);
  const action = useMutation({
    mutationFn: (kind: SetupAction) => setup(status.device_id, kind),
    onSuccess: () => {
      background(
        client.invalidateQueries({ queryKey: computerAiKey(status.device_id) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) =>
      notify({ message: 'Couldn’t set up the link. Try again', error, tone: 'critical' }),
  });
  const disabled = !status.online || action.isPending;
  return (
    <>
      <SetupRows native={native.data} disabled={disabled} run={action.mutate} />
      <List>
        <NavRow
          title="Attached CLI tools"
          subtitle="Run tools from a Claude session that’s open on this computer"
          disabled={!attachedCliToolsReady(status)}
          onPress={() => {
            showTools(true);
          }}
        />
      </List>
      <Sheet
        open={tools}
        title="Attached CLI tools"
        onClose={() => {
          showTools(false);
        }}
        detents={['full']}
      >
        {tools ? <AttachedCliTools status={status} /> : null}
      </Sheet>
    </>
  );
}
