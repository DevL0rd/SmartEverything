import type { BrushBrand, BrushPressure } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';
import { brandUi } from '../brands';

export function PressureBadge({
  brand,
  pressure,
}: {
  readonly brand: BrushBrand;
  readonly pressure: BrushPressure;
}): ReactNode {
  const look = brandUi(brand).pressure[pressure];
  return <Badge label={look.label} tone={look.tone} icon={look.icon} />;
}
