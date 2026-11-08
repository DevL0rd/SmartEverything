import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePushDeliveries } from '../../../api/diagnostics';
import { useServiceLogTail } from '../../../api/desktop-service';
import { CodeBlock } from '../../../components/code';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { count } from '../../../format/number';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useHubStatus, useIsOwner, useServiceLog } from '../../../store/selectors';
import { joinLogLines } from '../model/log-seam';
import { SettingsFrame } from '../../../settings/settings-frame';
import { background } from '@smarteverything/logging';
import { SERVER_PANEL, ServerPanels } from './server-panels';

function ServerRows(): ReactNode {
  const hub = useHubStatus();
  const now = useMinute();
  if (hub === null) {
    return null;
  }
  return (
    <List inset title="Server" className={SERVER_PANEL}>
      <ListRow icon="info" title="Version" subtitle={hub.version} wrapSubtitle />
      <ValueRow icon="clock" title="Running since" value={relative(hub.startedAt, now)} />
      <ValueRow
        icon="cameras"
        title="Camera service"
        value={hub.cameras === 'running' ? 'Running' : 'Stopped'}
      />
    </List>
  );
}

function Pushes(): ReactNode {
  const status = usePushDeliveries();
  if (status.isPending) {
    return <Skeleton shape="block" />;
  }
  if (status.isError) {
    return (
      <ErrorState
        error={status.error}
        wrapDetail
        retry={() => {
          background(status.refetch(), 'status.refetch_failed');
        }}
      />
    );
  }
  const data = status.data;
  return (
    <List
      inset
      title="Notifications sent"
      {...(data.lastError === null ? {} : { footer: data.lastError })}
    >
      <ValueRow icon="bell" title="Delivered" value={count(data.sent)} />
      <ValueRow icon="alert" title="Failed" value={count(data.failed)} />
      <ValueRow icon="trash" title="Phones removed" value={count(data.removed)} />
    </List>
  );
}

function LiveLog({ bridge }: { readonly bridge: DesktopBridge }): ReactNode {
  const tail = useServiceLogTail(bridge);
  const live = useServiceLog();
  const lines = joinLogLines(tail.data?.lines ?? [], live);
  return (
    <Section title="Live log">
      {tail.isError ? (
        <ErrorState
          error={tail.error}
          wrapDetail
          retry={() => {
            background(tail.refetch(), 'tail.refetch_failed');
          }}
        />
      ) : null}
      {tail.isPending ? (
        <Skeleton shape="block" />
      ) : (
        <CodeBlock label={tail.data?.file ?? 'Log'} code={lines.join('\n')} wrapLines />
      )}
    </Section>
  );
}

export function DiagnosticsScreen(): ReactNode {
  const bridge = desktopBridge();
  const owner = useIsOwner();
  return (
    <SettingsFrame page="server/diagnostics" contentWidth="full">
      <ServerPanels>
        <ServerRows />
        {owner ? (
          <View className={SERVER_PANEL}>
            <Pushes />
          </View>
        ) : null}
      </ServerPanels>
      {bridge === null ? null : <LiveLog bridge={bridge} />}
    </SettingsFrame>
  );
}
