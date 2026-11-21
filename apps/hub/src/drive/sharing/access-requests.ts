import type {
  DriveAccessAnswer,
  DriveAccessBox,
  DriveAccessRequest,
  DriveAccessRequestCreate,
  DriveOpenItem,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';

export interface AccessRequestsEnv {
  readonly store: Pick<Store, 'host'>;
}

export interface AccessRequestPage {
  readonly items: readonly DriveAccessRequest[];
  readonly next: string | null;
}

export class DriveAccessRequests {
  constructor(private readonly env: AccessRequestsEnv) {}

  open(actor: DriveActor, itemId: string): Promise<DriveOpenItem> {
    return this.env.store.host.read('driveAccessOpen', { actor, itemId });
  }

  request(actor: DriveActor, request: DriveAccessRequestCreate): Promise<DriveAccessRequest> {
    return this.env.store.host.write('driveAccessRequest', { actor, request });
  }

  list(
    actor: DriveActor,
    box: DriveAccessBox,
    cursor: string | undefined,
  ): Promise<AccessRequestPage> {
    return this.env.store.host.read('driveAccessRequests', { actor, box, cursor });
  }

  answer(
    actor: DriveActor,
    requestId: string,
    answer: DriveAccessAnswer,
  ): Promise<DriveAccessRequest> {
    return this.env.store.host.write('driveAccessAnswer', { actor, requestId, answer });
  }
}
