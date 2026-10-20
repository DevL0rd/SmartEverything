import type { TreadmillViewOf } from '../../../api/treadmills';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Disclosure } from '../../../components/disclosure';
import { LoadedQuery } from '../../../components/loaded-query';
import { NavRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useTreadmillAct } from '../data/treadmill-act';
import { useTreadmillView } from '../data/treadmill-data';
import {
  capabilityLines,
  familyName,
  frameLine,
  gattLines,
  identityFacts,
  inclineRangeLines,
} from '../model/diagnostics-model';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

const SHOWN_FRAMES = 20;

type Diagnostics = TreadmillViewOf<'diagnostics'>;

function Lines({ lines }: { readonly lines: readonly string[] }): ReactNode {
  return (
    <View className="gap-0.5 px-4 pb-3">
      {lines.map((line, index) => (
        <Text
          key={`${String(index)}-${line}`}
          variant="caption"
          tone="variant"
          selectable
          className="tabular"
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

function Technical({ view }: { readonly view: Diagnostics }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="px-3 pb-2">
      <Disclosure
        label="GATT and capabilities"
        open={open}
        onToggle={() => {
          setOpen((now) => !now);
        }}
        hint="Shows the Bluetooth table the belt answered with"
      >
        <Lines
          lines={[
            ...capabilityLines(view.identity),
            ...inclineRangeLines(view.identity, view.gatt),
            ...gattLines(view.gatt),
          ]}
        />
      </Disclosure>
    </View>
  );
}

function RawLog({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: Diagnostics;
}): ReactNode {
  const { act } = useTreadmillAct(deviceId);
  const frames = view.rawLog.frames.slice(-SHOWN_FRAMES).map(frameLine);
  return (
    <>
      <SwitchRow
        icon="activity"
        title="Record raw frames"
        subtitle="Keeps the last 500 frames in memory, off by default"
        value={view.rawLog.enabled}
        onChange={(next) => {
          act({ action: 'raw_log', enabled: next }, 'Could not change the frame log');
        }}
      />
      {view.rawLog.enabled && frames.length > 0 ? <Lines lines={frames} /> : null}
    </>
  );
}

function Body({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: Diagnostics;
}): ReactNode {
  return (
    <List inset title="Diagnostics">
      <ValueRow icon="cpu" title="Protocol family" value={familyName(view.family)} />
      {identityFacts(view.identity).map((fact) => (
        <ValueRow key={fact.label} title={fact.label} value={fact.value} />
      ))}
      <ValueRow title="Reconnects" value={count(view.link.reconnects)} />
      <ValueRow
        title="Command answer time"
        value={view.latencyMs === null ? 'Not measured' : `${count(Math.round(view.latencyMs))} ms`}
      />
      <ValueRow title="Last error" value={view.lastError ?? 'None'} />
      <ValueRow
        title="Records on the belt"
        value={view.padRecordsRemaining === null ? 'Unknown' : count(view.padRecordsRemaining)}
      />
      <Technical view={view} />
      <RawLog deviceId={deviceId} view={view} />
      <NavRow
        icon="close"
        title="Forget this treadmill"
        subtitle="Open the device settings to remove it"
        href={href.settings.device(deviceId)}
      />
    </List>
  );
}

export function DiagnosticsList({ deviceId, state }: SettingsProps): ReactNode {
  const query = useTreadmillView(deviceId, 'diagnostics', {}, state.mayConfigure);
  if (!state.mayConfigure) {
    return null;
  }
  return (
    <Anchored deviceId={deviceId} id="diagnostics" label="Diagnostics">
      <LoadedQuery query={query}>{(view) => <Body deviceId={deviceId} view={view} />}</LoadedQuery>
    </Anchored>
  );
}
