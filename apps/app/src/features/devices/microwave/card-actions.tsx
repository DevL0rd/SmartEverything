import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { MICROWAVE_REASONS } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { ReasonLine } from '../../../components/reason-line';
import type { Device } from '../../../store/state';
import { OFFLINE_LINE } from './card-model';
import { OperatingButtons } from './operating-buttons';
import type { QuickChoice, QuickState } from './quick-model';
import type { MicrowaveRun } from './run-model';
import type { MicrowaveQuick } from './use-quick';

function QuickMenu({
  chips,
  disabled,
  send,
}: {
  readonly chips: readonly QuickChoice[];
  readonly disabled: boolean;
  readonly send: (choice: QuickChoice) => Promise<void>;
}): ReactNode {
  const items: readonly MenuItem[] = chips.map((chip) => ({
    label: chip.label,
    icon: 'timer',
    onPress: (): void => {
      background(send(chip), 'microwave.quick_failed');
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Quick');
  return (
    <View ref={ref} collapsable={false}>
      <Button label="Quick" variant="text" icon="timer" disabled={disabled} onPress={open} />
      {menu}
    </View>
  );
}

function PrimaryAction({
  primary,
  busy,
  send,
}: {
  readonly primary: QuickChoice;
  readonly busy: boolean;
  readonly send: (choice: QuickChoice) => Promise<void>;
}): ReactNode {
  return (
    <Button
      label={primary.label}
      icon={primary.start ? 'play' : 'timer'}
      variant={primary.start ? 'filled' : 'tonal'}
      loading={busy}
      onPress={() => {
        background(send(primary), 'microwave.quick_failed');
      }}
    />
  );
}

function ReadyActions({
  state,
  busy,
  send,
  compact,
}: {
  readonly state: Extract<QuickState, { kind: 'ready' }>;
  readonly busy: boolean;
  readonly send: (choice: QuickChoice) => Promise<void>;
  readonly compact: boolean;
}): ReactNode {
  const { primary, chips } = state;
  return (
    <>
      <PrimaryAction primary={primary} busy={busy} send={send} />
      {compact || chips.length === 0 ? null : (
        <QuickMenu chips={chips} disabled={busy} send={send} />
      )}
    </>
  );
}

interface ActionInput {
  readonly device: Device;
  readonly run: Pick<MicrowaveRun, 'phase'>;
  readonly quick: MicrowaveQuick;
  readonly compact?: boolean;
}

export function cardActions({
  device,
  run,
  quick,
  compact = false,
}: ActionInput): readonly ReactNode[] {
  switch (run.phase) {
    case 'offline':
      return [<ReasonLine key="why" icon="wifi" text={OFFLINE_LINE} />];
    case 'running':
    case 'paused':
      return [<OperatingButtons key="operate" device={device} primaryOnly={compact} />];
    case 'door_open':
      return [<ReasonLine key="why" icon="doorOpen" text={MICROWAVE_REASONS.doorOpen} />];
    case 'ready':
    case 'idle':
      return quick.state.kind === 'blocked'
        ? [<ReasonLine key="why" text={quick.state.reason} />]
        : [
            <ReadyActions
              key="go"
              state={quick.state}
              busy={quick.busy}
              send={quick.send}
              compact={compact}
            />,
          ];
  }
}
