import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type DESKTOP_DRIVE_READDIR_PLUS,
  type DesktopDriveTuning,
  type DesktopDriveTuningLimits,
} from '@smarteverything/domain';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { Badge } from '../../../components/badge';
import { SegmentBar } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { SelectPicker, type SelectOption } from '../../../components/select-picker';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { count } from '../../../format/number';
import { selectionTick } from '../../../platform/haptics';
import {
  TextEditSheet,
  type TextEditRequest,
  type TextEditReset,
} from '../../../settings/text-edit-sheet';
import {
  entryOf,
  fieldProblemOf,
  inFlightGaugeOf,
  initialTextOf,
  tuningIsDefault,
  tuningReset,
  tuningWith,
  valueTextOf,
} from './advanced-model';
import type { TuningRowSpec } from './advanced-rows';
import { NUMBER_LENGTH } from './page-sharing';
import { useStackedValue, valueLinesOf } from './value-lines';

type Readdir = (typeof DESKTOP_DRIVE_READDIR_PLUS)[number];

const READDIR_OPTIONS: readonly SelectOption<Readdir>[] = [
  { value: 'off', label: 'Off', description: 'Plain listings, details on demand' },
  { value: 'auto', label: 'Auto', description: 'The kernel picks per folder, like NFS' },
  { value: 'always', label: 'Always', description: 'Every listing carries file details' },
];

const READDIR_PICKER_WIDTH = 320;

export interface TuningRowProps {
  readonly spec: TuningRowSpec;
  readonly icon: TuningRowSpec['icon'];
  readonly tuning: DesktopDriveTuning;
  readonly limits: DesktopDriveTuningLimits | null;
  readonly remountPending: boolean;
  readonly notOnWindows: boolean;
  readonly busy: boolean;
  readonly subtitle: string;
  readonly apply: (tuning: DesktopDriveTuning) => void;
  readonly save: (tuning: DesktopDriveTuning) => Promise<unknown>;
}

function useInset(): string {
  return useIdiom() === 'pointer' ? 'pl-16' : 'pl-18';
}

function ResetButton({ spec, tuning, notOnWindows, busy, apply }: TuningRowProps): ReactNode {
  if (notOnWindows || tuningIsDefault(tuning, spec.field)) return null;
  return (
    <IconButton
      icon="reset"
      label={`Reset ${spec.title.toLowerCase()} to its default`}
      disabled={busy}
      onPress={() => {
        apply(tuningReset(tuning, spec.field));
      }}
    />
  );
}

function RowBadges({ remountPending, notOnWindows }: TuningRowProps): ReactNode {
  const inset = useInset();
  if (!remountPending && !notOnWindows) return null;
  return (
    <View className={cn('flex-row flex-wrap gap-2 pb-3 pr-4', inset)}>
      {remountPending ? (
        <Badge label="Applies after remount" tone="warning" icon="refresh" />
      ) : null}
      {notOnWindows ? <Badge label="Not on Windows" icon="ban" /> : null}
    </View>
  );
}

function InFlightGauge({ spec, tuning, limits, notOnWindows }: TuningRowProps): ReactNode {
  const inset = useInset();
  if (spec.field !== 'maxBackground' || notOnWindows) return null;
  const gauge = inFlightGaugeOf(tuning, limits);
  return (
    <View className={cn('gap-1 pb-3 pr-4', inset)}>
      <SegmentBar
        label="Requests in flight"
        segments={[
          { label: 'Full read ahead', value: gauge.congestion, colour: 'primary' },
          { label: 'Read ahead paused', value: gauge.max - gauge.congestion, colour: 'info' },
        ]}
        format={count}
        legend
      />
      <Text variant="caption" tone="variant" className="tabular">
        The kernel allows up to {count(gauge.ceiling)}
      </Text>
    </View>
  );
}

function SwitchTuningRow(props: TuningRowProps): ReactNode {
  const { spec, tuning, apply } = props;
  const value = tuning[spec.field] === true;
  return (
    <ListRow
      title={spec.title}
      icon={spec.icon}
      subtitle={props.subtitle}
      wrapSubtitle
      role="switch"
      checked={value}
      disabled={props.busy || props.notOnWindows}
      onPress={() => {
        selectionTick();
        apply(tuningWith(tuning, spec.field, !value));
      }}
      trailing={
        <View className="flex-row items-center gap-1">
          <ResetButton {...props} />
          <SwitchTrack value={value} mixed={false} />
        </View>
      }
    />
  );
}

function ReaddirTuningRow(props: TuningRowProps): ReactNode {
  const { spec, tuning, apply } = props;
  const ref = useRef<View>(null);
  const opener = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const stacked = useStackedValue();
  return (
    <View ref={ref} collapsable={false}>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        {...valueLinesOf(
          stacked,
          valueTextOf(spec.kind, tuning[spec.field], spec.zero),
          props.subtitle,
        )}
        wrapSubtitle
        wrapCaption
        chevron
        pressRef={opener}
        disabled={props.busy || props.notOnWindows}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label={spec.title}
        width={READDIR_PICKER_WIDTH}
        options={READDIR_OPTIONS}
        value={tuning.readdirPlus}
        anchor={anchor}
        opener={opener}
        onPick={(next) => {
          apply(tuningWith(tuning, spec.field, next));
        }}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}

function tuningResetOf({ spec, tuning, notOnWindows, save }: TuningRowProps): TextEditReset | null {
  if (notOnWindows || tuningIsDefault(tuning, spec.field)) return null;
  const standard = valueTextOf(spec.kind, DEFAULT_DESKTOP_DRIVE_TUNING[spec.field], spec.zero);
  return {
    label: 'Reset',
    spoken: `Reset ${spec.title.toLowerCase()} to ${standard.toLowerCase()}`,
    run: () => save(tuningReset(tuning, spec.field)),
  };
}

function useTuningRequest(
  props: TuningRowProps,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  const { spec, tuning, limits, save } = props;
  const empty = spec.kind === 'keep' || spec.kind === 'follow';
  const initial = initialTextOf(spec.kind, tuning[spec.field]);
  const reset = tuningResetOf(props);
  return {
    id: `drive.sync-mount.advanced.${spec.field}`,
    opener,
    title: spec.title,
    label: spec.label,
    ...(reset === null ? {} : { reset }),
    initial,
    placeholder: empty ? valueTextOf(spec.kind, tuning[spec.field], spec.zero) : initial,
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: spec.kind === 'count' || spec.kind === 'follow' ? 'number' : 'text',
    allowEmpty: empty,
    helper: spec.helper,
    problemOf: (text) => fieldProblemOf(tuning, limits, spec, text),
    save: async (text): Promise<void> => {
      await save(tuningWith(tuning, spec.field, entryOf(spec.kind, text)));
    },
  };
}

function TextTuningRow(props: TuningRowProps): ReactNode {
  const { spec, tuning } = props;
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useTuningRequest(props, opener);
  const stacked = useStackedValue();
  return (
    <>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        {...valueLinesOf(
          stacked,
          valueTextOf(spec.kind, tuning[spec.field], spec.zero),
          props.subtitle,
        )}
        wrapSubtitle
        wrapCaption
        chevron
        pressRef={opener}
        disabled={props.busy || props.notOnWindows}
        onPress={() => {
          setOpen(true);
        }}
      />
      <TextEditSheet
        request={open ? request : null}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function RowControl(props: TuningRowProps): ReactNode {
  if (props.spec.kind === 'switch') return <SwitchTuningRow {...props} />;
  if (props.spec.kind === 'readdir') return <ReaddirTuningRow {...props} />;
  return <TextTuningRow {...props} />;
}

export function TuningRow(props: TuningRowProps): ReactNode {
  return (
    <View>
      <RowControl {...props} />
      <InFlightGauge {...props} />
      <RowBadges {...props} />
    </View>
  );
}
