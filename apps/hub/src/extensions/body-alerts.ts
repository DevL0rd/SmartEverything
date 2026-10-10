import {
  bodyReadingPush,
  missingBodyFacts,
  profileDetailsPush,
  type BodyReadingRow,
  type RowChange,
} from '@smarteverything/domain';
import type { ServerExtension } from '../extensions';
import type { OwnerAlerts } from './owner-alerts';

function waiting(row: BodyReadingRow | null): boolean {
  return row !== null && row.attribution === 'pending' && row.weight_kg !== null;
}

function newlyPending(change: RowChange): BodyReadingRow | null {
  if (change.table !== 'body_readings' || change.record === null) {
    return null;
  }
  return waiting(change.record) && !waiting(change.oldRecord) ? change.record : null;
}

function counted(row: BodyReadingRow | null): boolean {
  return row !== null && row.attribution !== 'pending' && row.attribution !== 'ignored';
}

function newlyCounted(change: RowChange): BodyReadingRow | null {
  if (change.table !== 'body_readings' || change.record === null) {
    return null;
  }
  return counted(change.record) && !counted(change.oldRecord) ? change.record : null;
}

export function bodyAlertsExtension(options: { readonly alerts: OwnerAlerts }): ServerExtension {
  return (context) => {
    const unsubscribe = context.store.feed.subscribe((change) => {
      const reading = newlyPending(change);
      if (reading !== null) {
        options.alerts.raise(bodyReadingPush(reading));
      }
      const owned = newlyCounted(change);
      const profile =
        owned?.profile_id === null || owned === null
          ? null
          : context.store.profiles.byId(owned.profile_id);
      if (profile !== null && missingBodyFacts(profile)) {
        options.alerts.raise(profileDetailsPush(profile));
      }
    });
    return Promise.resolve({
      endpoints: {},
      routes: [],
      stop: (): Promise<void> => {
        unsubscribe();
        return Promise.resolve();
      },
    });
  };
}
