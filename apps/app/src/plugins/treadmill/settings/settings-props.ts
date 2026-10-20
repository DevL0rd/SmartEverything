import type { TreadmillStateView } from '@smarteverything/domain';
import type { TreadmillViewOf } from '../../../api/treadmills';

export interface SettingsProps {
  readonly deviceId: string;
  readonly state: TreadmillStateView;
  readonly settings: TreadmillViewOf<'settings'>;
}
