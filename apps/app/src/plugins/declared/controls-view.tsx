import { background } from '@smarteverything/logging';
import type { PluginId, WidgetControl } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Slider } from '../../components/slider';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { ActionBand } from '../../components/widget-board';
import { useRow } from '../../store/selectors';
import { FitBand, FitList } from '../shared/plugin-widget';
import { usePluginTool } from '../use-plugin-tool';
import { flagReading, numberReading } from './stream-value';
import { useStreamValue } from './use-stream-value';

const TOOL_OFF = 'Switched off in this plugin’s tools.';
const ROW_ESTIMATE = 48;
const ROW_GAP = 8;

type Control<K extends WidgetControl['kind']> = Extract<WidgetControl, { readonly kind: K }>;

type Press = (args: Readonly<Record<string, unknown>>) => Promise<unknown>;

interface RowProps<K extends WidgetControl['kind']> {
  readonly pluginId: PluginId;
  readonly control: Control<K>;
  readonly offReason: string | null;
  readonly press: Press;
}

function Label({
  label,
  note,
}: {
  readonly label: string;
  readonly note: string | null;
}): ReactNode {
  return (
    <View className="min-w-0 shrink gap-0.5">
      <Text variant="callout" numberOfLines={1}>
        {label}
      </Text>
      {note === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {note}
        </Text>
      )}
    </View>
  );
}

function ButtonControl({ control, offReason, press }: RowProps<'button'>): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={control.label}
      variant="tonal"
      loading={busy}
      disabled={offReason !== null}
      onPress={() => {
        setBusy(true);
        background(
          press(control.args).finally(() => {
            setBusy(false);
          }),
          'declared_control.failed',
        );
      }}
    />
  );
}

function ToggleRow({ pluginId, control, offReason, press }: RowProps<'toggle'>): ReactNode {
  const reading = flagReading(useStreamValue(pluginId, control.value));
  const note = offReason ?? (reading.state === 'missing' ? reading.reason : null);
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Label label={control.label} note={note} />
      <Switch
        label={control.label}
        value={reading.state === 'ready' && reading.on}
        disabled={note !== null}
        onChange={(next) => {
          background(press({ ...control.args, [control.arg]: next }), 'declared_control.failed');
        }}
      />
    </View>
  );
}

function SliderRow({ pluginId, control, offReason, press }: RowProps<'slider'>): ReactNode {
  const reading = numberReading(useStreamValue(pluginId, control.value));
  const note = offReason ?? (reading.state === 'missing' ? reading.reason : null);
  return (
    <View className="gap-1">
      <Label label={control.label} note={note} />
      <Slider
        label={control.label}
        value={reading.state === 'ready' ? reading.value : null}
        min={control.min}
        max={control.max}
        step={control.step}
        disabled={note !== null}
        onCommit={(next) => {
          background(press({ ...control.args, [control.arg]: next }), 'declared_control.failed');
        }}
      />
    </View>
  );
}

interface Keyed {
  readonly key: string;
  readonly control: WidgetControl;
  readonly offReason: string | null;
  readonly press: Press;
}

function ControlRow({
  pluginId,
  row,
}: {
  readonly pluginId: PluginId;
  readonly row: Keyed;
}): ReactNode {
  const { control, offReason, press } = row;
  const shared = { pluginId, offReason, press };
  switch (control.kind) {
    case 'button':
      return <Label label={control.label} note={offReason} />;
    case 'toggle':
      return <ToggleRow {...shared} control={control} />;
    case 'slider':
      return <SliderRow {...shared} control={control} />;
  }
}

function useKeyed(pluginId: PluginId, items: readonly WidgetControl[]): readonly Keyed[] {
  const ui = useRow('plugin_ui', pluginId);
  const tools = usePluginTool(pluginId);
  return items.map((control, index) => ({
    key: `${String(index)}:${control.kind}:${control.label}`,
    control,
    offReason: ui?.tools_off.includes(control.tool) === true ? TOOL_OFF : null,
    press: (args) => tools.run(control.tool, args, `${control.label} did not work`),
  }));
}

function BandButton({
  pluginId,
  row,
}: {
  readonly pluginId: PluginId;
  readonly row: Keyed;
}): ReactNode {
  const { control, offReason, press } = row;
  return control.kind === 'button' ? (
    <ButtonControl pluginId={pluginId} control={control} offReason={offReason} press={press} />
  ) : null;
}

export function ControlsView({
  pluginId,
  items,
}: {
  readonly pluginId: PluginId;
  readonly items: readonly WidgetControl[];
}): ReactNode {
  const keyed = useKeyed(pluginId, items);
  const lane = keyed.filter((row) => row.control.kind !== 'button' || row.offReason !== null);
  const buttons = keyed.filter((row) => row.control.kind === 'button');
  if (lane.length === 0) {
    return (
      <FitBand items={buttons} keyOf={(row) => row.key}>
        {(row) => <BandButton pluginId={pluginId} row={row} />}
      </FitBand>
    );
  }
  return (
    <>
      <FitList items={lane} keyOf={(row) => row.key} estimate={ROW_ESTIMATE} gap={ROW_GAP}>
        {(row) => <ControlRow pluginId={pluginId} row={row} />}
      </FitList>
      <ActionBand>
        {buttons.map((row) => (
          <BandButton key={row.key} pluginId={pluginId} row={row} />
        ))}
      </ActionBand>
    </>
  );
}
