import { frameLayoutMath } from '../../../components/frame-layout';
import type { IconName } from '../../../components/icon';

export const PHONE_SECTION_IDS = [
  'overview',
  'battery',
  'sound',
  'screen',
  'network',
  'storage',
  'apps',
  'notifications',
  'activity',
  'setup',
] as const;

export type PhoneSectionId = (typeof PHONE_SECTION_IDS)[number];

export interface PhoneSectionDef {
  readonly id: PhoneSectionId;
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
}

export const PHONE_SECTIONS: readonly PhoneSectionDef[] = [
  { id: 'overview', label: 'Overview', icon: 'smartphone' },
  { id: 'battery', label: 'Battery', icon: 'battery' },
  { id: 'sound', label: 'Sound', icon: 'volume' },
  { id: 'screen', label: 'Screen', icon: 'sun' },
  { id: 'network', label: 'Network', icon: 'wifi' },
  { id: 'storage', label: 'Storage', icon: 'layers' },
  { id: 'apps', label: 'Apps', icon: 'grid' },
  { id: 'notifications', label: 'Notifications', short: 'Alerts', icon: 'bell' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'setup', label: 'Setup', icon: 'settings' },
];

export const { frameLayoutOf, railWidthOf, bodyWidthOf, twoColumnsAt } = frameLayoutMath({
  compactMax: 600,
  iconRailMax: 720,
  wideRailMin: 1024,
});
