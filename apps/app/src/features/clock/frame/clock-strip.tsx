import type { ReactNode } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import type { ClockSection } from '../model/section-routes';
import { openClockSection } from './open-section';
import { CLOCK_SECTION_DEFS } from './sections';

const OPTIONS: readonly SegmentedOption<ClockSection>[] = CLOCK_SECTION_DEFS.map((def) => ({
  value: def.id,
  label: def.short,
  spoken: def.label,
  icon: def.icon,
}));

export function ClockStrip({ active }: { readonly active: ClockSection }): ReactNode {
  const router = useRouter();
  const navigation = useNavigation();
  return (
    <Segmented
      options={OPTIONS}
      value={active}
      label="Clock sections"
      fill
      compact
      onChange={(section) => {
        openClockSection({ section, active, navigation, router });
      }}
    />
  );
}
