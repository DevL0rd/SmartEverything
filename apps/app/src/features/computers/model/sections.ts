import type { ComputerFeature } from '@smarteverything/domain';
import { frameLayoutMath } from '../../../components/frame-layout';
import type { IconName } from '../../../components/icon';

export interface SectionDef {
  readonly id: string;
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
  readonly feature: ComputerFeature | null;
  readonly missing: string | null;
}

export const SECTIONS: readonly SectionDef[] = [
  { id: 'overview', label: 'Overview', icon: 'monitor', feature: null, missing: null },
  { id: 'performance', label: 'Performance', icon: 'gauge', feature: null, missing: null },
  {
    id: 'processes',
    label: 'Processes',
    icon: 'activity',
    feature: 'processes',
    missing: 'Programs aren’t available on this computer yet',
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'speaker',
    feature: 'audio',
    missing: 'Sound control isn’t available on this computer yet',
  },
  {
    id: 'displays',
    label: 'Displays',
    icon: 'tv',
    feature: 'displays',
    missing: 'Screen control isn’t available on this computer yet',
  },
  {
    id: 'files',
    label: 'Files',
    icon: 'folder',
    feature: 'files',
    missing: 'Files aren’t available on this computer yet',
  },
  {
    id: 'apps',
    label: 'Apps and windows',
    short: 'Apps',
    icon: 'grid',
    feature: 'windows',
    missing: 'Open windows aren’t available on this computer yet',
  },
  { id: 'network', label: 'Network', icon: 'wifi', feature: 'network', missing: null },
  { id: 'storage', label: 'Storage', icon: 'layers', feature: 'disks', missing: null },
  {
    id: 'system',
    label: 'Power and system',
    short: 'Power',
    icon: 'power',
    feature: null,
    missing: null,
  },
];

export const AI_SECTIONS: readonly SectionDef[] = [
  { id: 'claude', label: 'Claude', icon: 'sparkles', feature: null, missing: null },
  { id: 'codex', label: 'Codex', icon: 'bot', feature: null, missing: null },
  { id: 'claude-sessions', label: 'Sessions', icon: 'terminal', feature: null, missing: null },
];

export function offersSection(
  def: SectionDef,
  features: readonly ComputerFeature[] | undefined,
): boolean {
  return def.feature === null || features === undefined || features.includes(def.feature);
}

export function notAvailableOn(os: string | null): string {
  return os === null ? 'Not available yet' : `Not available on ${os} yet`;
}

export const { frameLayoutOf, railWidthOf, bodyWidthOf, twoColumnsAt } = frameLayoutMath({
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
});
