import type { ReactNode } from 'react';
import { View } from 'react-native';
import { laundryProgramOptions, withRole, type LaundryOption } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Text } from '../../../components/text';
import { Card } from '../../../components/card';
import { Note, Pills, RoleSwitch, SwitchRow, type PillOption } from './parts';
import type { DraftHandle } from './use-draft';
import type { Laundry } from './use-laundry';

const SOAK = [
  { value: '0', label: 'Off', spoken: 'No soak' },
  { value: '10', label: '10 min', spoken: '10 minutes' },
  { value: '20', label: '20 min', spoken: '20 minutes' },
  { value: '30', label: '30 min', spoken: '30 minutes' },
] as const;

const DRYING = [
  { value: 'None', label: 'Off', spoken: 'No drying' },
  { value: 'Smart', label: 'Smart' },
  { value: 'Timed', label: 'Timed' },
] as const;

const DRYNESS = [
  { value: 'Ironing', label: 'Iron-dry' },
  { value: 'Wear Immediately', label: 'Wear now' },
  { value: 'Store', label: 'Cupboard-dry' },
] as const;

const ANTI_CREASE = [
  { value: '0', label: 'Off', spoken: 'No anti-crease' },
  { value: '30', label: '30 min', spoken: '30 minutes' },
  { value: '60', label: '1 h', spoken: '1 hour' },
  { value: '120', label: '2 h', spoken: '2 hours' },
] as const;

function temperaturePill(raw: string): PillOption {
  return raw === '0'
    ? { value: raw, label: 'Cold', spoken: 'Cold' }
    : { value: raw, label: `${raw}°`, spoken: `${raw} degrees` };
}

function spinPill(raw: string): PillOption {
  return raw === '0'
    ? { value: raw, label: 'Off', spoken: 'No spin' }
    : { value: raw, label: raw, spoken: `${raw} revolutions per minute` };
}

function enumOptions(laundry: Laundry, role: 'wash_temperature' | 'spin_speed'): readonly string[] {
  const kind = withRole(laundry.presentation, role)?.capability.value;
  return kind?.kind === 'enum' ? [...kind.options].sort((a, b) => Number(a) - Number(b)) : [];
}

function numberRange(laundry: Laundry, role: 'rinse_count'): { min: number; max: number } {
  const kind = withRole(laundry.presentation, role)?.capability.value;
  return kind?.kind === 'number' ? { min: kind.min, max: kind.max } : { min: 0, max: 5 };
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <Text variant="body" className="flex-1">
        {label}
      </Text>
      <NumberStepper
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        {...(unit === undefined ? {} : { unit })}
        onChange={onChange}
      />
    </View>
  );
}

function Choice({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly PillOption[];
  readonly value: string | null;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <Pills
      label={label}
      options={options}
      value={value}
      disabled={disabled}
      fill
      onChange={onChange}
    />
  );
}

interface FieldProps {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
  readonly uses: ReadonlySet<LaundryOption>;
  readonly disabled: boolean;
}

function HeatFields({ laundry, draft, uses, disabled }: FieldProps): ReactNode {
  const { shown } = draft;
  return (
    <>
      {uses.has('temperature') ? (
        <Pills
          label="Temperature"
          options={enumOptions(laundry, 'wash_temperature').map(temperaturePill)}
          value={shown.temperature === null ? null : String(shown.temperature)}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ temperature: Number(value) });
          }}
        />
      ) : null}
      {uses.has('spin') ? (
        <Pills
          label="Spin speed (rpm)"
          options={enumOptions(laundry, 'spin_speed').map(spinPill)}
          value={shown.spin === null ? null : String(shown.spin)}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ spin: Number(value) });
          }}
        />
      ) : null}
    </>
  );
}

function CountFields({ laundry, draft, uses, disabled }: FieldProps): ReactNode {
  const { shown } = draft;
  return (
    <>
      {uses.has('rinses') ? (
        <Stepper
          label="Rinses"
          value={shown.rinses}
          {...numberRange(laundry, 'rinse_count')}
          step={1}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ rinses: value });
          }}
        />
      ) : null}
      {uses.has('soak') ? (
        <Choice
          label="Soak"
          options={SOAK}
          value={String(shown.soakMinutes ?? 0)}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ soakMinutes: Number(value) });
          }}
        />
      ) : null}
      {uses.has('washMinutes') ? (
        <Stepper
          label="Wash time"
          value={shown.washMinutes}
          min={0}
          max={120}
          step={5}
          unit="min"
          disabled={disabled}
          onChange={(value) => {
            draft.change({ washMinutes: value });
          }}
        />
      ) : null}
    </>
  );
}

function isDryMode(value: string): value is 'None' | 'Smart' | 'Timed' {
  return value === 'None' || value === 'Smart' || value === 'Timed';
}

function isDryTarget(value: string): value is 'Ironing' | 'Wear Immediately' | 'Store' {
  return value === 'Ironing' || value === 'Wear Immediately' || value === 'Store';
}

function DryDetail({
  draft,
  disabled,
}: {
  readonly draft: DraftHandle;
  readonly disabled: boolean;
}): ReactNode {
  const { shown } = draft;
  if (shown.dryMode === 'Timed') {
    return (
      <Stepper
        label="Drying time"
        value={shown.dryMinutes}
        min={10}
        max={180}
        step={10}
        unit="min"
        disabled={disabled}
        onChange={(value) => {
          draft.change({ dryMinutes: value });
        }}
      />
    );
  }
  return shown.dryMode === 'Smart' ? (
    <Choice
      label="Dryness"
      options={DRYNESS}
      value={shown.dryTarget}
      disabled={disabled}
      onChange={(value) => {
        if (isDryTarget(value)) {
          draft.change({ dryTarget: value });
        }
      }}
    />
  ) : null;
}

function DryFields({
  draft,
  disabled,
}: {
  readonly draft: DraftHandle;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <>
      <Choice
        label="Drying"
        options={DRYING}
        value={draft.shown.dryMode}
        disabled={disabled}
        onChange={(value) => {
          if (isDryMode(value)) {
            draft.change({ dryMode: value });
          }
        }}
      />
      <DryDetail draft={draft} disabled={disabled} />
    </>
  );
}

function ToggleFields({ draft, uses, disabled }: Omit<FieldProps, 'laundry'>): ReactNode {
  const { shown } = draft;
  return (
    <>
      {uses.has('steam') ? (
        <SwitchRow
          title="Steam hygiene"
          sub="Hot steam before the wash."
          value={shown.steam}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ steam: value });
          }}
        />
      ) : null}
      {uses.has('extraWater') ? (
        <SwitchRow
          title="Extra water"
          value={shown.extraWater}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ extraWater: value });
          }}
        />
      ) : null}
      {uses.has('quiet') ? (
        <SwitchRow
          title="Quiet mode"
          sub="Slower spin, for night."
          value={shown.quiet}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ quiet: value });
          }}
        />
      ) : null}
    </>
  );
}

function FinishFields({ laundry, draft, uses, disabled }: FieldProps): ReactNode {
  return (
    <>
      {uses.has('antiCrease') ? (
        <Choice
          label="Anti-crease after finish"
          options={ANTI_CREASE}
          value={String(draft.shown.antiCreaseMinutes ?? 0)}
          disabled={disabled}
          onChange={(value) => {
            draft.change({ antiCreaseMinutes: Number(value) });
          }}
        />
      ) : null}
      <ToggleFields draft={draft} uses={uses} disabled={disabled} />
      {uses.has('temperature') ? (
        <RoleSwitch
          laundry={laundry}
          source="smart_mode"
          title="Auto-adjust to the load"
          sub="The machine picks settings from the load."
        />
      ) : null}
    </>
  );
}

export function OptionsCard({
  laundry,
  draft,
}: {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
}): ReactNode {
  const { program } = draft;
  if (program === undefined) {
    return null;
  }
  const uses = new Set(laundryProgramOptions(program));
  const props = { laundry, draft, uses, disabled: laundry.state.offline };
  return (
    <Card title="Options">
      <View className="gap-4">
        {uses.size === 0 ? (
          <Note text="Drum clean runs with its own settings. Take the laundry out first." />
        ) : null}
        <HeatFields {...props} />
        <CountFields {...props} />
        {uses.has('dryMode') ? <DryFields draft={draft} disabled={laundry.state.offline} /> : null}
        <FinishFields {...props} />
      </View>
    </Card>
  );
}
