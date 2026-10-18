import type { ReactNode } from 'react';
import { useMemo, type RefObject } from 'react';
import type { View } from 'react-native';
import type { TargetState } from '@smarteverything/domain';
import { ColourStrip } from '../../../components/colour-strip';
import { colourNames, spreadText } from '../group-summary';
import { ringColours } from '../master-marks';
import {
  COLOUR_PRESETS,
  WHITE_PRESETS,
  colourMatch,
  stripSwatches,
  whiteMatch,
} from '../model/colour-presets';
import type { Master } from '../use-master';

export function supportsColourStrip(state: TargetState): boolean {
  return (state.support.color ?? 0) + (state.support.color_temperature ?? 0) > 0;
}

export function GroupColourStrip({
  state,
  colours,
  master,
  name,
  focusRef,
  onMore,
}: {
  readonly state: TargetState;
  readonly colours: Readonly<Record<string, string>>;
  readonly master: Master;
  readonly name: string;
  readonly focusRef: RefObject<View | null>;
  readonly onMore: () => void;
}): ReactNode {
  const colour = (state.support.color ?? 0) > 0;
  const swatches = useMemo(() => stripSwatches(colour), [colour]);
  const selectedId = colour ? colourMatch(state.colours) : whiteMatch(state.whiteTemperature);
  const ring = ringColours(colours);
  const label = colour ? colourNames(state.colours) : spreadText(state.whiteTemperature, ' K');
  return (
    <ColourStrip
      label={`${name} colour`}
      swatches={swatches}
      selectedId={selectedId}
      current={ring.length === 0 ? null : { colours: ring, label: `Current: ${label}` }}
      density="full"
      surface="surface-1"
      disabled={state.power === 'none'}
      focusRef={focusRef}
      onMore={onMore}
      onPick={(id) => {
        const preset = COLOUR_PRESETS.find((candidate) => candidate.id === id);
        if (preset !== undefined) {
          master.setColour(preset.colour, 'commit');
          return;
        }
        const white = WHITE_PRESETS.find((candidate) => candidate.id === id);
        if (white !== undefined) master.setWhite(white.kelvin, 'commit');
      }}
    />
  );
}
