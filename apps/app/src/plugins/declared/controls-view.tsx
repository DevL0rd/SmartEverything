import { background } from '@smarteverything/logging';
import type { PluginId, WidgetControl } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Slider } from '../../components/slider';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import { useRow } from '../../store/selectors';
import { usePluginTool } from '../use-plugin-tool';
import { flagReading, numberReading } from './stream-value';
import { useStreamValue } from './use-stream-value';

const TOOL_OFF = 'Switched off in this plugin’s tools.';

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
        <Text variant="caption" tone="faint" numberOfLines={2}>
          {note}
        </Text>
      )}
    </View>
  );
}

function ButtonRow({ control, offReason, press }: RowProps<'button'>): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Label label={control.label} note={offReason} />
      <Button
        label="Run"
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
    </View>
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

function ControlRow({
  pluginId,
  control,
}: {
  readonly pluginId: PluginId;
  readonly control: WidgetControl;
}): ReactNode {
  const ui = useRow('plugin_ui', pluginId);
  const tools = usePluginTool(pluginId);
  const offReason = ui?.tools_off.includes(control.tool) === true ? TOOL_OFF : null;
  const press: Press = (args) => tools.run(control.tool, args, `${control.label} did not work`);
  const shared = { pluginId, offReason, press };
  switch (control.kind) {
    case 'button':
      return <ButtonRow {...shared} control={control} />;
    case 'toggle':
      return <ToggleRow {...shared} control={control} />;
    case 'slider':
      return <SliderRow {...shared} control={control} />;
  }
}

export function ControlsView({
  pluginId,
  items,
}: {
  readonly pluginId: PluginId;
  readonly items: readonly WidgetControl[];
}): ReactNode {
  return (
    <View className="gap-2">
      {items.map((control, index) => (
        <ControlRow
          key={`${String(index)}:${control.kind}:${control.label}`}
          pluginId={pluginId}
          control={control}
        />
      ))}
    </View>
  );
}
