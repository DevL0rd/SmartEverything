import type { IconName } from '../components/icon';

export interface DevicePageContribution {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly settings: readonly string[];
}
