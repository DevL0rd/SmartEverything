import type { PluginManifest, PluginRow, PluginStatus } from '@smarteverything/domain';
import { isIconName, type IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { joinParts } from '../../../format/text';

interface StatusLook {
  readonly label: string;
  readonly tone: Tone;
}

const STATUS: Readonly<Record<PluginStatus, StatusLook>> = {
  disabled: { label: 'Off', tone: 'variant' },
  starting: { label: 'Starting', tone: 'variant' },
  running: { label: 'On', tone: 'positive' },
  crashed: { label: 'Stopped with a problem', tone: 'critical' },
  needs_auth: { label: 'Needs setting up', tone: 'warning' },
};

export function statusLook(status: PluginStatus): StatusLook {
  return STATUS[status];
}

export function pluginIcon(manifest: PluginManifest): IconName {
  return manifest.icon !== null && isIconName(manifest.icon) ? manifest.icon : 'puzzle';
}

export function pluginSubtitle(row: PluginRow): string {
  return joinParts([row.manifest.publisher, statusLook(row.status).label]);
}
