import type {
  AccessRequestDecision,
  AccessRequestRow,
  NewAccessRequest,
  PersonAccess,
  PersonAccessChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { Store } from '../store/store';

const log = new Logger('hub.access-requests');

const SETTINGS_PATH = '/settings/access';

export interface AccessRequestsOptions {
  readonly store: Pick<Store, 'host'>;
  readonly alerts: OwnerAlerts;
  readonly now: () => Date;
  readonly scopesChanged: (profileId: string) => void;
}

export class AccessRequests {
  constructor(private readonly options: AccessRequestsOptions) {}

  list(profileId: string | null, status?: AccessRequestRow['status']): Promise<AccessRequestRow[]> {
    return this.options.store.host.read('accessRequestList', {
      profileId,
      status: status ?? null,
    });
  }

  async create(profileId: string, request: NewAccessRequest): Promise<AccessRequestRow> {
    const { store, alerts } = this.options;
    const { row, name, wording } = await store.host.write('accessRequestCreate', {
      profileId,
      request,
    });
    alerts.raise({
      title: `${name} asks for more access`,
      body: request.note === '' ? wording : request.note,
      data: { kind: 'access_request', requestId: row.id, path: SETTINGS_PATH },
    });
    log.info('access_request.created', { requestId: row.id, profileId, kind: request.kind });
    return row;
  }

  async decide(
    requestId: string,
    by: string,
    decision: AccessRequestDecision,
  ): Promise<AccessRequestRow> {
    const { row, wording } = await this.options.store.host.write('accessRequestDecide', {
      requestId,
      by,
      decision,
      now: this.options.now().toISOString(),
    });
    this.options.scopesChanged(row.profile_id);
    this.options.alerts.raise({
      title: decision.approve ? 'Your request was approved' : 'Your request was denied',
      body: wording,
      data: { kind: 'access_request_decided', requestId: row.id, path: SETTINGS_PATH },
      person: row.profile_id,
    });
    log.info('access_request.decided', { requestId, approved: decision.approve });
    return row;
  }

  async lapse(): Promise<readonly string[]> {
    const touched = await this.options.store.host.write('accessRequestsLapse', {
      now: this.options.now().toISOString(),
    });
    for (const profileId of new Set(touched)) this.options.scopesChanged(profileId);
    return touched;
  }

  changeByOwner(profileId: string, change: PersonAccessChange): Promise<PersonAccess> {
    return this.options.store.host.write('accessChangeByOwner', { profileId, change });
  }
}
