import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../../components/badge';
import { useMinute } from '../../../store/clock';
import { stateChipOf } from '../model/bottle-model';

export function StateChip({ view }: { readonly view: BottleStatusView }): ReactNode {
  const chip = stateChipOf(view, useMinute());
  const tone: BadgeTone = chip.tone;
  return <Badge label={chip.label} tone={tone} icon={chip.icon} />;
}
