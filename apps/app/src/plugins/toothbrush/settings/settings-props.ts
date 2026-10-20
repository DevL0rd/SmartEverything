import type { BrushStateView } from '@smarteverything/domain';
import type { BrushViewOf } from '../../../api/toothbrushes';

export interface SettingsProps {
  readonly deviceId: string;
  readonly state: BrushStateView;
  readonly settings: BrushViewOf<'settings'>;
}
