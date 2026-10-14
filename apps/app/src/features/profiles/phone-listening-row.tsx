import type { ReactNode } from 'react';
import type { ScaleRelayStatus } from '../../../modules/health-connect';
import { ListRow } from '../../components/list-row';
import { joinParts } from '../../format/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import {
  allowWritesAndSave,
  listenAgain,
  useRelayState,
  useWriteState,
  type RelayState,
} from './scale-listener';

function since(label: string, at: string | null, now: number): string | null {
  return at === null ? null : `${label} ${relative(at, now)}`;
}

function blocked(native: ScaleRelayStatus): ReactNode {
  if (!native.permission) {
    return (
      <ListRow
        title="This phone can't hear Bluetooth devices"
        subtitle="Nearby devices permission missing · Allow"
        subtitleTone="warning"
        icon="smartphone"
        onPress={() => {
          void listenAgain();
        }}
      />
    );
  }
  return (
    <ListRow
      title="This phone can't hear Bluetooth devices"
      subtitle="Bluetooth is off"
      subtitleTone="warning"
      icon="smartphone"
    />
  );
}

function listening(native: ScaleRelayStatus, live: boolean, now: number): ReactNode {
  const mode = live ? 'Listening now, app open' : 'Listening in the background';
  return (
    <>
      <ListRow
        title="This phone"
        subtitle={joinParts([
          native.registeredAt === null ? 'Not listening yet' : mode,
          since('heard', native.lastHeardAt, now) ?? 'nothing heard yet',
          since('sent', native.lastUploadedAt, now),
        ])}
        icon="smartphone"
        onPress={() => {
          void listenAgain();
        }}
      />
      {native.lastError === null ? null : (
        <ListRow
          title="Last problem"
          subtitle={joinParts([native.lastError, since('', native.lastErrorAt, now)])}
          subtitleTone="critical"
          icon="warning"
        />
      )}
    </>
  );
}

function relayRows(state: RelayState, now: number): ReactNode {
  switch (state.kind) {
    case 'unsupported':
      return null;
    case 'starting':
      return <ListRow title="This phone" subtitle="Starting to listen…" icon="smartphone" />;
    case 'update_needed':
      return (
        <ListRow
          title="Update the app to hear Bluetooth devices"
          subtitle={state.reason}
          subtitleTone="warning"
          icon="download"
        />
      );
    case 'failed':
      return (
        <ListRow
          title="This phone is not listening"
          subtitle={state.reason}
          subtitleTone="critical"
          icon="smartphone"
          onPress={() => {
            void listenAgain();
          }}
        />
      );
    case 'ready':
      return state.native.permission && state.native.bluetooth
        ? listening(state.native, state.live, now)
        : blocked(state.native);
  }
}

export function PhoneListeningRows({ health = true }: { readonly health?: boolean }): ReactNode {
  const now = useMinute();
  const relay = useRelayState();
  const write = useWriteState();
  return (
    <>
      {relayRows(relay, now)}
      {health && write.kind === 'needs_permission' ? (
        <ListRow
          title="Save weigh-ins to Health Connect"
          subtitle={`${String(write.waiting)} waiting · Allow access`}
          subtitleTone="warning"
          icon="heartPulse"
          onPress={() => {
            void allowWritesAndSave();
          }}
        />
      ) : null}
      {health && write.kind === 'failed' ? (
        <ListRow
          title="Weigh-ins not saved to Health Connect"
          subtitle={write.reason}
          subtitleTone="critical"
          icon="heartPulse"
        />
      ) : null}
    </>
  );
}
