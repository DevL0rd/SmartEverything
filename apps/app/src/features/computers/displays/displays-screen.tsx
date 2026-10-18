import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  NIGHT_LIGHT_MODES,
  type DisplayOutput,
  type DisplayState,
  type NightLight,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ReasonLine } from '../../../components/reason-line';
import { Segmented } from '../../../components/segmented';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { StateMissing } from '../components/state-missing';
import { useComputerDisplays, type DisplaysView } from '../data/computer-displays';
import {
  arrangementOf,
  isOnlyScreen,
  nightLightLine,
  NIGHT_LIGHT_LABELS,
} from '../model/displays-model';
import { Arrangement } from './arrangement';
import { DisplayRow } from './display-list';
import { DisplaySheet } from './display-sheet';
import { KeepDialog } from './keep-dialog';

const TOPICS = ['displays'] as const;

function ArrangementCard({
  state,
  offline,
  onOpen,
  view,
}: {
  readonly state: DisplayState;
  readonly offline: boolean;
  readonly onOpen: (id: string) => void;
  readonly view: DisplaysView;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const touch = useIdiom() === 'touch';
  const layout = arrangementOf(state.outputs, Math.max(240, width));
  return (
    <Card title="Arrangement">
      <View className="gap-3" onLayout={onLayout}>
        <Arrangement
          disabled={offline || view.pending !== null}
          outputs={state.outputs}
          on={layout.on}
          off={layout.off}
          height={layout.height}
          onOpen={onOpen}
          onMove={(id, drop) => {
            view.change({ action: 'position', output: id, ...drop });
          }}
        />
        <View className="flex-row flex-wrap items-center gap-3">
          <Button
            label="Identify"
            icon="eye"
            variant="tonal"
            disabled={offline}
            onPress={() => {
              view.change({ action: 'identify' });
            }}
          />
          <Text variant="caption" tone="variant" className="min-w-0 flex-1">
            {touch
              ? 'Tap a screen to edit it. Change the position in its settings.'
              : 'Drag a screen next to another one to change the layout.'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function NightLightCard({
  light,
  disabled,
  onChange,
}: {
  readonly light: NightLight;
  readonly disabled: boolean;
  readonly onChange: (mode: NightLight['mode']) => void;
}): ReactNode {
  const line = nightLightLine(light);
  return (
    <Card title="Night light">
      <View className="flex-row flex-wrap items-center gap-3">
        <Segmented
          label="Night light"
          value={light.mode}
          disabled={disabled}
          options={NIGHT_LIGHT_MODES.map((mode) => ({
            value: mode,
            label: NIGHT_LIGHT_LABELS[mode],
          }))}
          onChange={onChange}
        />
        {line === null ? null : (
          <Text variant="callout" tone="variant">
            {line}
          </Text>
        )}
      </View>
    </Card>
  );
}

function toggleOutput(
  state: DisplayState,
  view: DisplaysView,
  output: DisplayOutput,
  enabled: boolean,
): void {
  const apply = (): void => {
    view.change({ action: enabled ? 'enable' : 'disable', output: output.id });
  };
  if (enabled || !isOnlyScreen(state.outputs, output.id)) {
    apply();
    return;
  }
  background(
    confirm({
      title: 'Turn off your only screen?',
      body: `${output.name} goes dark and this computer has no other screen. It comes back in 15 s unless you keep it from here.`,
      confirmLabel: 'Turn off',
    }).then((accepted) => {
      if (accepted) apply();
    }),
    'computer.display_confirm_failed',
  );
}

function unavailable(view: DisplaysView, device: Device): ReactNode {
  const { state, features } = view;
  if (features !== undefined && !features.includes('displays')) {
    return (
      <EmptyState
        icon="tv"
        title="Screen control isn’t available on this computer yet"
        body="It needs a supported desktop to change screens."
      />
    );
  }
  if (state === undefined) {
    return (
      <StateMissing
        load={view.load}
        offline={!device.online}
        loading={
          <View className="gap-4">
            <Skeleton shape="block" />
            <Skeleton shape="block" />
          </View>
        }
      />
    );
  }
  if (state.outputs.length > 0) return null;
  return (
    <EmptyState
      icon="tv"
      title="This computer has no screens connected"
      body="Screens show up here when one is plugged in."
    />
  );
}

interface SectionProps {
  readonly device: Device;
  readonly view: DisplaysView;
  readonly state: DisplayState;
}

function Overlays({
  view,
  state,
  open,
  offline,
  onClose,
  onToggle,
}: Omit<SectionProps, 'device'> & {
  readonly open: string | null;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onToggle: (output: DisplayOutput, enabled: boolean) => void;
}): ReactNode {
  const { pending } = view;
  return (
    <>
      <DisplaySheet
        output={state.outputs.find((output) => output.id === open) ?? null}
        outputs={state.outputs}
        features={view.features}
        offline={offline || pending !== null}
        onClose={onClose}
        onToggle={onToggle}
        send={view.change}
      />
      {pending === null ? null : (
        <KeepDialog
          key={pending.token}
          pending={pending}
          blank={state.outputs.every((output) => !output.enabled)}
          deciding={view.deciding}
          onDecide={(keep) => {
            view.decide(keep, pending.token);
          }}
          onExpire={() => {
            view.expire(pending.token);
          }}
        />
      )}
    </>
  );
}

function DisplayRows({
  state,
  locked,
  canSwitch,
  onOpen,
  onToggle,
}: {
  readonly state: DisplayState;
  readonly locked: boolean;
  readonly canSwitch: boolean;
  readonly onOpen: (id: string) => void;
  readonly onToggle: (output: DisplayOutput, enabled: boolean) => void;
}): ReactNode {
  return (
    <List title="Displays" caption={String(state.outputs.length)}>
      {state.outputs.map((output) => (
        <DisplayRow
          key={output.id}
          output={output}
          disabled={locked}
          canSwitch={canSwitch}
          onOpen={() => {
            onOpen(output.id);
          }}
          onToggle={(enabled) => {
            onToggle(output, enabled);
          }}
        />
      ))}
    </List>
  );
}

function DisplaysSections({ device, view, state }: SectionProps): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const offline = !device.online;
  const toggle = (output: DisplayOutput, enabled: boolean): void => {
    toggleOutput(state, view, output, enabled);
  };
  return (
    <View className="gap-section-gap">
      {offline ? (
        <ReasonLine
          icon="wifiOff"
          tone="warning"
          text={`${device.label} is offline. Changes are paused until it is back.`}
        />
      ) : null}
      <ArrangementCard state={state} offline={offline} onOpen={setOpen} view={view} />
      <DisplayRows
        state={state}
        locked={offline || view.pending !== null}
        canSwitch={view.features === undefined || view.features.includes('display_enable')}
        onOpen={setOpen}
        onToggle={toggle}
      />
      {state.nightLight.supported ? (
        <NightLightCard
          light={state.nightLight}
          disabled={offline}
          onChange={(mode) => {
            view.change({ action: 'night_light', mode });
          }}
        />
      ) : null}
      <Overlays
        view={view}
        state={state}
        open={open}
        offline={offline}
        onClose={() => {
          setOpen(null);
        }}
        onToggle={toggle}
      />
    </View>
  );
}

export function DisplaysBody({ device }: { readonly device: Device }): ReactNode {
  const view = useComputerDisplays(device.id, device.online);
  const message = unavailable(view, device);
  if (message !== null || view.state === undefined) return message;
  return <DisplaysSections device={device} view={view} state={view.state} />;
}

export function ComputerDisplaysScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Displays" width="detail">
      {device?.kind === 'computer' ? (
        <DemandRegion deviceId={deviceId} topics={TOPICS}>
          <DisplaysBody device={device} />
        </DemandRegion>
      ) : null}
    </ComputerFrame>
  );
}
