import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Grid } from '../../../components/grid';
import { Icon, type IconName } from '../../../components/icon';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';

export interface ScanHelpStep {
  readonly icon: IconName;
  readonly title: string;
  readonly points: readonly string[];
}

export const SCAN_HELP_TITLE = 'How to scan your home';

export const SCAN_HELP_INTRO =
  'A realistic view is a gaussian splat: a 3D photo of your home made from a video or many photos. A few habits while filming make the difference between a sharp scan and a blurry one.';

export const SCAN_HELP_STEPS: readonly ScanHelpStep[] = [
  {
    icon: 'sun',
    title: 'Flat, even light',
    points: [
      'The scan keeps the light that was there while you filmed, and removing it later is hard.',
      'Turn every lamp on and soften the daylight. Avoid patches of direct sun and one strong lamp.',
      'Keep the light the same for the whole capture. Use sheers or a time of day that tames bright windows.',
    ],
  },
  {
    icon: 'camera',
    title: 'Lock the camera',
    points: [
      'Lock exposure, ISO, white balance and focus before you start.',
      '4K at 30 frames a second works best. Never switch lens during the capture.',
      'Move slowly: blur hurts the scan more than noise.',
    ],
  },
  {
    icon: 'footprints',
    title: 'A slow route',
    points: [
      'Walk the route once without recording.',
      'In each room film the edges facing inward, then the middle, and a second height where furniture hides the floor.',
      'Move through the room instead of turning on the spot.',
      'Slow down and pause on both sides of every doorway. This matters most.',
      'Take stairs in short steps.',
    ],
  },
  {
    icon: 'eyeOff',
    title: 'Keep the home still',
    points: [
      'Cover mirrors.',
      'Keep people and pets out of view, and stop fans, TVs and moving curtains.',
    ],
  },
  {
    icon: 'smartphone',
    title: 'No computer? Use Scaniverse',
    points: [
      'Scaniverse is free on Android, makes the scan on the phone and exports PLY and SPZ.',
      'Scan one room or one floor at a time, since detail drops on large areas.',
    ],
  },
  {
    icon: 'upload',
    title: 'Then add it here',
    points: [
      'Upload the .ply, .splat or .spz file in the Realistic view of your map.',
      'Line it up with your rooms once, and it shows under the map from then on.',
    ],
  },
];

function Step({ step, index }: { readonly step: ScanHelpStep; readonly index: number }): ReactNode {
  return (
    <View className="w-full flex-row items-start gap-3 rounded-lg border-hairline border-outline-variant bg-surface-raised p-4">
      <View className="size-12 shrink-0 items-center justify-center rounded-lg bg-primary-container">
        <Icon name={step.icon} size={24} tone="primary" />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <Text variant="body-strong" accessibilityRole="header">
          {`${String(index + 1)}. ${step.title}`}
        </Text>
        {step.points.map((point) => (
          <View key={point} className="flex-row gap-2">
            <View className="mt-2 size-1.5 rounded-full bg-on-surface-variant" />
            <Text variant="callout" tone="variant" className="flex-1">
              {point}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ScanHelpScreen(): ReactNode {
  return (
    <Screen header={<PageHeader title={SCAN_HELP_TITLE} />}>
      <View className="gap-grid-gap">
        <Text variant="callout" tone="variant" className="max-w-reading">
          {SCAN_HELP_INTRO}
        </Text>
        <Grid minItemWidth={320} cellClassName="max-w-reading">
          {SCAN_HELP_STEPS.map((step, index) => (
            <Step key={step.title} step={step} index={index} />
          ))}
        </Grid>
      </View>
    </Screen>
  );
}
