import type { SightFacing } from '@smarteverything/domain';

export interface SightPreviewProps {
  readonly slot: 'sent' | 'self';
  readonly fit: 'cover' | 'contain';
  readonly label: string;
  readonly facing: SightFacing;
  readonly light: boolean;
}
