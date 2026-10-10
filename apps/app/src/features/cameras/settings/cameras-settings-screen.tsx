import type { ReactNode } from 'react';
import type { CameraReach } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { settingsTrail } from '../../../settings/tree';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { NavRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { joinParts } from '../../../format/text';
import { useCameraPrefs } from '../data/use-camera-condition';
import { useCameraEntries, useCameraReaches } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';

function summaryOf(entry: CameraEntry): string {
  if (!entry.device.online) {
    return 'Offline';
  }
  return joinParts([
    entry.room,
    entry.camera?.record_events === true ? 'Saving event clips' : null,
  ]);
}

function firewallSummary(reaches: readonly CameraReach[]): string {
  const needs = reaches.filter(
    (reach) => reach.state === 'needs_rule' || reach.state === 'blocked',
  );
  if (needs.length > 0) {
    return needs.length === 1 ? '1 needs a rule' : `${String(needs.length)} need a rule`;
  }
  return 'All open';
}

export function CamerasSettingsScreen(): ReactNode {
  const entries = useCameraEntries();
  const reaches = useCameraReaches();
  const prefs = useCameraPrefs();
  return (
    <Screen
      header={
        <PageHeader title="Camera settings" breadcrumbs={settingsTrail('cameras').slice(0, -1)} />
      }
      maxWidth="reading"
    >
      {entries.length === 0 ? (
        <EmptyState icon="cameras" title="No cameras" body="Cameras you link show up here." />
      ) : (
        <List title="Your cameras" inset>
          {entries.map((entry) => (
            <NavRow
              key={entry.device.id}
              title={entry.name}
              subtitle={summaryOf(entry)}
              icon="cameras"
              href={href.settings.camera(entry.device.id)}
            />
          ))}
        </List>
      )}
      <List title="Watching" inset>
        <NavRow
          title="Remote viewing"
          icon="globe"
          value={prefs.value.awayMode === 'server' ? 'Through your server' : 'Direct'}
          href={href.settings.remoteViewing()}
        />
        {reaches.length === 0 ? null : (
          <NavRow
            title="Firewall"
            icon="shield"
            value={firewallSummary(reaches)}
            href={href.settings.page('server/firewall')}
          />
        )}
        <NavRow title="Doorbell and calls" icon="bell" href={href.settings.page('notifications')} />
      </List>
    </Screen>
  );
}
