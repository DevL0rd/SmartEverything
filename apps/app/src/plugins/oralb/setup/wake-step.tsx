import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { BrushCandidate } from '../../../../modules/health-connect';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { RING, loopStyle } from '../../../design/loops';
import { useOnScreenGate } from '../../../design/visibility';
import { sortedCandidates } from '../../toothbrush/model/setup-model';
import { CandidateRow } from '../../toothbrush/setup/candidate-row';
import { StaticBrush } from '../../toothbrush/setup/static-brush';
import { boxStyle } from '../../toothbrush/charts/style';
import { useRef } from 'react';
import { borderColorStyle } from '../charts/style';

export const WAKE_TEXT =
  'Lift the brush or press its power button. It broadcasts while nobody else is connected, also on the charger.';

export const WAKE_HINT =
  'Nothing heard? Close the Oral-B app, or move the brush away from an iO Sense charger.';

const RADAR_PX = 168;
const RING_MS = 1600;
const RING_DELAY_MS = 800;

function Radar({ listening }: { readonly listening: boolean }): ReactNode {
  const frame = useRef<View>(null);
  const { moving, onLayout } = useOnScreenGate(frame, listening);
  const edge = useColour('primary');
  const first = loopStyle({ name: RING, ms: RING_MS, easing: 'ease-out' }, moving);
  const second = loopStyle(
    { name: RING, ms: RING_MS, delay: RING_DELAY_MS, easing: 'ease-out' },
    moving,
  );
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      aria-hidden
      className="items-center justify-center self-center"
      style={boxStyle(RADAR_PX, RADAR_PX)}
    >
      {[first, second].map((motion, index) =>
        motion === null ? null : (
          <Animated.View
            key={index}
            pointerEvents="none"
            className="absolute rounded-full border-2"
            style={[boxStyle(RADAR_PX - 24, RADAR_PX - 24), borderColorStyle(edge), motion]}
          />
        ),
      )}
      <StaticBrush brand="oralb" px={RADAR_PX - 24} />
    </View>
  );
}

export function OralbWakeStep({
  candidates,
  picked,
  onPick,
}: {
  readonly candidates: readonly BrushCandidate[];
  readonly picked: string | null;
  readonly onPick: (address: string) => void;
}): ReactNode {
  const found = sortedCandidates(candidates);
  return (
    <View className="gap-4">
      <Radar listening={found.length === 0} />
      <Text variant="callout" tone="variant">
        {WAKE_TEXT}
      </Text>
      {found.length === 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
            <ActivityIndicator size="small" colorClassName="accent-primary" />
            <Text variant="callout" accessibilityLiveRegion="polite">
              Looking for an Oral-B brush…
            </Text>
          </View>
          <Text variant="footnote" tone="variant">
            {WAKE_HINT}
          </Text>
        </View>
      ) : (
        <View className="gap-2" accessibilityRole="radiogroup">
          {found.map((candidate) => (
            <CandidateRow
              key={candidate.address}
              candidate={candidate}
              picked={picked === candidate.address}
              onPick={() => {
                onPick(candidate.address);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
