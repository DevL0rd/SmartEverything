import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { HsvColor, TargetState } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ColourPicker } from '../../../components/colour-picker';
import type { Mixed } from '../../../components/level-math';
import { mixedOf } from '../master-marks';
import { LevelSurface } from '../../../components/level-surface';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { plural } from '../../../format/text';
import type { MemberNoun } from '../group-summary';
import type { Master } from '../use-master';

type Mode = 'white' | 'colour';

const PRESETS: readonly { readonly name: string; readonly kelvin: number }[] = [
  { name: 'Warm', kelvin: 2700 },
  { name: 'Soft', kelvin: 3000 },
  { name: 'Neutral', kelvin: 4000 },
  { name: 'Daylight', kelvin: 5500 },
  { name: 'Cool', kelvin: 6500 },
];

function whiteMix(state: TargetState, tick: string): Mixed | undefined {
  return mixedOf(state.whiteTemperature, {}, tick);
}

function Preset({
  name,
  kelvin,
  current,
  onPress,
}: {
  readonly name: string;
  readonly kelvin: number;
  readonly current: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${name} ${String(kelvin)} K`}
      selected={current}
      onPress={onPress}
      className={
        current
          ? 'min-h-touch-min justify-center rounded-full border-hairline border-primary bg-primary-container px-4'
          : 'min-h-touch-min justify-center rounded-full border-hairline border-outline-variant bg-surface-1 px-4'
      }
      layerClassName="rounded-full"
    >
      <Text
        variant="label"
        tone={current ? 'primary' : 'default'}
      >{`${name} ${String(kelvin)}`}</Text>
    </Interactive>
  );
}

function White({ state, master, name }: Body): ReactNode {
  const spread = state.whiteTemperature;
  const mixed = whiteMix(state, useColour('on-surface'));
  return (
    <View className="gap-3">
      <LevelSurface
        variant="white"
        shape="bar"
        label={`${name} white temperature`}
        value={spread === null ? null : spread.mean}
        {...(mixed === undefined ? {} : { mixed })}
        onChange={master.setWhite}
      />
      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Preset
            key={preset.name}
            {...preset}
            current={
              spread !== null && spread.min === preset.kelvin && spread.max === preset.kelvin
            }
            onPress={() => {
              master.setWhite(preset.kelvin, 'commit');
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Colour({ state, master, name }: Body): ReactNode {
  const only = state.colours.length === 1 ? (state.colours[0] ?? null) : null;
  const [draft, setDraft] = useState<HsvColor | null>(null);
  return (
    <ColourPicker
      label={`${name} colour`}
      value={draft ?? only}
      onChange={(colour) => {
        setDraft(colour);
        master.setColour(colour, 'live');
      }}
      onCommit={(colour) => {
        setDraft(colour);
        master.setColour(colour, 'commit');
      }}
    />
  );
}

interface Body {
  readonly state: TargetState;
  readonly noun: MemberNoun;
  readonly master: Master;
  readonly name: string;
}

function supportNote(state: TargetState, noun: MemberNoun): string {
  const members = plural(state.members, noun);
  return `White: ${String(state.support.color_temperature ?? 0)} of ${members} · Colour: ${String(state.support.color ?? 0)} of ${members}`;
}

export function ColourSheet({
  name,
  noun,
  state,
  master,
  onClose,
}: Body & { readonly onClose: () => void }): ReactNode {
  const [mode, setMode] = useState<Mode>('white');
  const colourCapable = (state.support.color ?? 0) > 0;
  const shown = colourCapable ? mode : 'white';
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${name} colour`}
      detents={['fit', 'full']}
      footer={<Button label="Done" onPress={onClose} />}
    >
      <View className="gap-4">
        {colourCapable ? (
          <Segmented
            label="Colour mode"
            value={shown}
            onChange={setMode}
            options={[
              { value: 'white', label: 'White' },
              { value: 'colour', label: 'Colour' },
            ]}
          />
        ) : null}
        {shown === 'white' ? (
          <White state={state} master={master} name={name} />
        ) : (
          <Colour state={state} master={master} name={name} />
        )}
        <Text variant="footnote" tone="variant">
          {supportNote(state, noun)}
        </Text>
      </View>
    </Sheet>
  );
}
