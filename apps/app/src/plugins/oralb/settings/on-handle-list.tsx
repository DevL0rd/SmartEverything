import { ORALB_MODES, type OralbMode } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import { useBrushAct, useConfigure } from '../../toothbrush/data/brush-act';
import { Anchored } from '../../toothbrush/settings/anchored';
import { StepperRow } from '../../toothbrush/settings/rows';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { HeadActions } from '../components/head-actions';
import { useOralbConfig } from '../data/use-oralb';
import { pacerBarOf, reminderWord, slotsOf, type SlotView } from '../model/care-model';
import {
  LOCK_NOTICE,
  QUARTER_RANGE,
  anyWritePassed,
  gateOf,
  quarterTarget,
  type Gate,
} from '../model/settings-model';
import { moveSlot } from '../model/slot-order';
import { RingChoice } from './ring-choice';

const DEFAULT_QUARTER_S = 30;

function Pacer({
  deviceId,
  gate,
  pacer,
}: {
  readonly deviceId: string;
  readonly gate: Gate;
  readonly pacer: readonly number[] | null;
}): ReactNode {
  const control = useControl(deviceId, 'brush_pacer');
  const on = pacerBarOf(pacer).totalS > 0;
  return (
    <Anchored deviceId={deviceId} id="oralb-pacer" label="Quarter pacer">
      <SwitchRow
        icon="timer"
        title="Quarter pacer"
        subtitle={on ? 'On. The handle pulses every quarter.' : 'Off. No quarters are timed.'}
        wrapSubtitle
        value={on}
        disabled={!gate.open}
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
    </Anchored>
  );
}

function Quarter({
  deviceId,
  gate,
  pacer,
}: {
  readonly deviceId: string;
  readonly gate: Gate;
  readonly pacer: readonly number[] | null;
}): ReactNode {
  const control = useControl(deviceId, 'brush_quadrant_seconds');
  const bar = pacerBarOf(pacer);
  const seconds = bar.segments[0] ?? DEFAULT_QUARTER_S;
  return (
    <Anchored deviceId={deviceId} id="oralb-quarter" label="Seconds per quarter">
      <StepperRow
        title="Seconds per quarter"
        subtitle={
          bar.segments.length === 0
            ? 'The pacer is off'
            : quarterTarget(seconds, bar.segments.length)
        }
        disabled={!gate.open || bar.segments.length === 0}
        value={seconds}
        range={QUARTER_RANGE}
        unit="s"
        onChange={(next) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
    </Anchored>
  );
}

function SlotLine({
  slot,
  index,
  last,
  busy,
  open,
  onMove,
}: {
  readonly slot: SlotView;
  readonly index: number;
  readonly last: boolean;
  readonly busy: boolean;
  readonly open: boolean;
  readonly onMove: (by: -1 | 1) => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-2">
      <Text variant="callout" tone="variant" className="w-6 tabular">
        {index + 1}
      </Text>
      <Text variant="callout" className="min-w-0 flex-1">
        {slot.label}
      </Text>
      <IconButton
        icon="arrowUp"
        label={`Move ${slot.label} up`}
        disabled={!open || busy || index === 0}
        onPress={() => {
          onMove(-1);
        }}
      />
      <IconButton
        icon="chevronDown"
        label={`Move ${slot.label} down`}
        disabled={!open || busy || last}
        onPress={() => {
          onMove(1);
        }}
      />
    </View>
  );
}

function Order({
  deviceId,
  gate,
  slots,
}: {
  readonly deviceId: string;
  readonly gate: Gate;
  readonly slots: readonly OralbMode[];
}): ReactNode {
  const { act, busy } = useBrushAct(deviceId);
  const rows = slotsOf(slots, null);
  return (
    <Anchored deviceId={deviceId} id="oralb-modes" label="Mode order">
      <View className="gap-1 px-4 py-2">
        <Text variant="body">Mode order</Text>
        {rows.length === 0 ? (
          <Text variant="callout" tone="variant">
            Not read yet
          </Text>
        ) : (
          rows.map((slot, index) => (
            <SlotLine
              key={slot.mode}
              slot={slot}
              index={index}
              last={index === rows.length - 1}
              busy={busy}
              open={gate.open}
              onMove={(by) => {
                act(
                  { action: 'set_mode_order', modes: [...moveSlot(slots, index, by)] },
                  'The mode order could not be changed',
                  true,
                );
              }}
            />
          ))
        )}
      </View>
    </Anchored>
  );
}

function Reminder({ deviceId, state }: Pick<SettingsProps, 'deviceId' | 'state'>): ReactNode {
  return (
    <Anchored deviceId={deviceId} id="oralb-head" label="Brush head reminder">
      <View className="gap-2 px-4 py-2">
        <Text variant="body">Brush head reminder</Text>
        <Text variant="callout" tone="variant">
          {reminderWord(state.head.reminder) ?? 'Not read yet'}
        </Text>
        <HeadActions deviceId={deviceId} view={state} right={false} />
      </View>
    </Anchored>
  );
}

function Consent({
  deviceId,
  consent,
}: {
  readonly deviceId: string;
  readonly consent: boolean;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <Anchored deviceId={deviceId} id="oralb-consent" label="Let SmartEverything change this brush">
      <SwitchRow
        icon="shield"
        title="Let SmartEverything change this brush"
        subtitle="Allows the pacer, mode order, ring colour and head reminder of this brush to be changed from the app and by automations"
        wrapSubtitle
        value={consent}
        onChange={(next) => {
          configure({ consent: next });
        }}
      />
    </Anchored>
  );
}

export function OnHandleList({ deviceId, state }: SettingsProps): ReactNode {
  const { oralb, consent } = useOralbConfig(deviceId);
  const handle = state.handle.oralb;
  if (handle === null || !state.mayConfigure) {
    return null;
  }
  const gateFor = (key: Parameters<typeof gateOf>[1]): Gate =>
    gateOf(oralb, key, handle.firmware, consent);
  const locked = !anyWritePassed(oralb, handle.firmware);
  const slots = handle.modeSlots.filter((mode) => ORALB_MODES.includes(mode));
  return (
    <Anchored deviceId={deviceId} id="oralb-on-handle" label="On the handle">
      <View className="gap-2">
        <List inset title="On the handle">
          <ListRow
            icon="lock"
            title={locked ? 'Changing the brush is off' : 'Changing the brush'}
            subtitle={
              locked ? LOCK_NOTICE : 'Each change opens when its own handle test has passed.'
            }
            wrapSubtitle
          />
          <Pacer deviceId={deviceId} gate={gateFor('pacer')} pacer={handle.pacer} />
          <Quarter deviceId={deviceId} gate={gateFor('quarter')} pacer={handle.pacer} />
          <Order deviceId={deviceId} gate={gateFor('modes')} slots={slots} />
          <RingChoice deviceId={deviceId} gate={gateFor('ring')} handle={handle} />
          <Reminder deviceId={deviceId} state={state} />
          {locked ? null : <Consent deviceId={deviceId} consent={consent} />}
        </List>
        {locked ? null : consent ? null : (
          <ReasonLine text="Turn on the switch above so changes are written to the handle." />
        )}
      </View>
    </Anchored>
  );
}
