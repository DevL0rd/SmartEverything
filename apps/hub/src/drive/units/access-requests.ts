import {
  ApiError,
  type DriveAccessAnswer,
  type DriveAccessBox,
  type DriveAccessRequest,
  type DriveAccessRequestCreate,
  type DriveItem,
  type DriveOpenItem,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { itemAccess, type DriveActor, type ItemAccess } from '../access';
import type { AccessRequestPage } from '../sharing/access-requests';

export const ACCESS_REQUEST_PAGE_SIZE = 50;

const log = new Logger('hub.drive');

const STRENGTH: Readonly<Record<ItemAccess, number>> = {
  none: 0,
  view: 1,
  edit: 2,
  shared: 3,
  own: 3,
};

type AccessRequestsStore = Pick<
  Store,
  | 'driveAccessRequests'
  | 'driveGrants'
  | 'driveItems'
  | 'driveRoots'
  | 'driveNotifications'
  | 'profiles'
  | 'write'
>;

class AccessRequestRules {
  constructor(private readonly env: { readonly store: AccessRequestsStore }) {}

  open(actor: DriveActor, itemId: string): DriveOpenItem {
    const { store } = this.env;
    const item = store.driveItems.find(itemId, actor.profileId);
    if (item === undefined) return { access: 'none', requestable: false, pendingRequest: null };
    const access = this.accessTo(actor, item);
    if (access !== 'none') return { access, item };
    return {
      access: 'none',
      requestable: true,
      pendingRequest: store.driveAccessRequests.pendingFor(item.id, actor.profileId) ?? null,
    };
  }

  request(actor: DriveActor, input: DriveAccessRequestCreate): DriveAccessRequest {
    const { store } = this.env;
    const made = this.alreadyRequested(actor, input);
    if (made !== undefined) return made;
    const item = store.driveItems.find(input.itemId, actor.profileId);
    if (item === undefined) {
      throw new ApiError('not_found', 'There is no such file or folder to ask for.');
    }
    const drive = store.driveRoots.byId(item.rootId);
    if (drive.scope === 'home' || drive.ownerProfileId === null) {
      throw new ApiError(
        'invalid_request',
        'Everyone in the home already has the Shared Drive; there is no one to ask.',
      );
    }
    const held = this.accessTo(actor, item);
    if (STRENGTH[held] >= STRENGTH[input.role]) {
      throw new ApiError('invalid_request', 'You already have at least that access.');
    }
    const waiting = store.driveAccessRequests.pendingFor(item.id, actor.profileId);
    if (waiting !== undefined) return waiting;
    const ownerProfileId = drive.ownerProfileId;
    return store.write(() => {
      const created = store.driveAccessRequests.create({
        id: input.id,
        itemId: item.id,
        requesterProfileId: actor.profileId,
        role: input.role,
        message: input.message,
      });
      store.driveNotifications.add({
        profileId: ownerProfileId,
        kind: 'access_requested',
        itemId: item.id,
        actorProfileId: actor.profileId,
        actorName: null,
        refId: created.id,
      });
      log.info('drive_access_request.created', {
        requestId: created.id,
        itemId: item.id,
        role: created.role,
        by: actor.profileId,
      });
      return created;
    });
  }

  list(actor: DriveActor, box: DriveAccessBox, cursor: string | undefined): AccessRequestPage {
    const { driveAccessRequests } = this.env.store;
    const window =
      box === 'made'
        ? driveAccessRequests.made(actor.profileId, cursor ?? null, ACCESS_REQUEST_PAGE_SIZE)
        : driveAccessRequests.waiting(actor.profileId, cursor ?? null, ACCESS_REQUEST_PAGE_SIZE);
    return { items: window.requests, next: window.next };
  }

  answer(actor: DriveActor, requestId: string, answer: DriveAccessAnswer): DriveAccessRequest {
    const { store } = this.env;
    const request = store.driveAccessRequests.find(requestId, actor.profileId);
    if (request?.ownerProfileId !== actor.profileId) {
      throw new ApiError('not_found', 'There is no such access request for this caller.');
    }
    if (request.state !== 'pending') {
      throw new ApiError('conflict', 'That request was already answered.');
    }
    const item = store.driveItems.find(request.itemId, actor.profileId);
    if (item === undefined) {
      throw new ApiError('not_found', 'The item this request asked for is gone.');
    }
    return store.write(() => {
      if (answer.decision === 'approve') {
        store.driveGrants.set(
          {
            itemId: item.id,
            profileId: request.requesterProfileId,
            role: answer.role,
            expiresAt: answer.expiresAt,
          },
          actor.profileId,
        );
      }
      const answered = store.driveAccessRequests.answer(request.id, actor.profileId, answer);
      store.driveNotifications.add({
        profileId: request.requesterProfileId,
        kind: 'access_answered',
        itemId: item.id,
        actorProfileId: actor.profileId,
        actorName: null,
        refId: answered.id,
      });
      log.info('drive_access_request.answered', {
        requestId: answered.id,
        itemId: item.id,
        decision: answer.decision,
        by: actor.profileId,
      });
      return answered;
    });
  }

  private alreadyRequested(
    actor: DriveActor,
    input: DriveAccessRequestCreate,
  ): DriveAccessRequest | undefined {
    const { driveAccessRequests } = this.env.store;
    const made =
      input.id === undefined ? undefined : driveAccessRequests.find(input.id, actor.profileId);
    if (made === undefined) return undefined;
    if (made.requesterProfileId !== actor.profileId || made.itemId !== input.itemId) {
      throw new ApiError('forbidden', 'That access request belongs to someone else.');
    }
    log.debug('drive_access_request.duplicate_ignored', { requestId: made.id });
    return made;
  }

  private accessTo(actor: DriveActor, item: DriveItem): ItemAccess {
    const { store } = this.env;
    return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
  }
}

export interface ActorItem {
  readonly actor: DriveActor;
  readonly itemId: string;
}

export const DRIVE_ACCESS_OPEN_UNIT = storeUnit((store, input: ActorItem) =>
  new AccessRequestRules({ store }).open(input.actor, input.itemId),
);

export const DRIVE_ACCESS_REQUEST_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly request: DriveAccessRequestCreate }) =>
    new AccessRequestRules({ store }).request(input.actor, input.request),
);

export const DRIVE_ACCESS_REQUESTS_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly box: DriveAccessBox;
      readonly cursor: string | undefined;
    },
  ) => new AccessRequestRules({ store }).list(input.actor, input.box, input.cursor),
);

export const DRIVE_ACCESS_ANSWER_UNIT = storeUnit(
  (
    store,
    input: {
      readonly actor: DriveActor;
      readonly requestId: string;
      readonly answer: DriveAccessAnswer;
    },
  ) => new AccessRequestRules({ store }).answer(input.actor, input.requestId, input.answer),
);
