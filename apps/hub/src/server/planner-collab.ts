import { ApiError } from '@smarteverything/domain';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import { MailService } from '../mail/service';
import { MailSettingsStore } from '../mail/settings';
import { BookingService } from '../planner/booking/service';
import { InviteService } from '../planner/invites/service';
import { PublicRsvp } from '../planner/invites/public';
import { inviteKeyOf } from '../planner/invites/token';
import type { ServerContext } from './context';
import { feedOriginOf } from './handlers/planner-feeds';

export interface PlannerCollab {
  readonly settings: MailSettingsStore;
  readonly mail: MailService;
  readonly invites: InviteService;
  readonly rsvp: PublicRsvp;
  readonly booking: BookingService;
}

const COLLABS = new WeakMap<ServerContext['store'], PlannerCollab>();

function originOf(context: ServerContext): () => string {
  const origin = feedOriginOf(context);
  return () => {
    try {
      return origin().url;
    } catch (cause) {
      if (cause instanceof ApiError) {
        throw new ApiError('conflict', 'The hub has no address to put in the invitation links.');
      }
      throw cause;
    }
  };
}

export function collabOf(context: ServerContext, now: () => Date): PlannerCollab {
  const known = COLLABS.get(context.store);
  if (known !== undefined) return known;
  const { store, secrets, hub } = context;
  const settings = new MailSettingsStore({ settingsKv: store.settingsKv, secrets });
  const mail = new MailService({ settings, store, log: context.log.forArea('hub.mail') });
  const invites = new InviteService({
    store,
    mail,
    key: inviteKeyOf(secrets),
    origin: originOf(context),
    now,
    log: context.log.forArea('hub.planner'),
  });
  const collab: PlannerCollab = {
    settings,
    mail,
    invites,
    rsvp: new PublicRsvp({ store, now }),
    booking: new BookingService({ store, invites, now, emit: hub.signals.emit }),
  };
  COLLABS.set(context.store, collab);
  return collab;
}

export function followCollab(
  collab: PlannerCollab,
  context: ServerContext,
  alerts: Pick<OwnerAlerts, 'raise'>,
): () => void {
  const stopRows = context.store.feed.subscribe((change) => {
    collab.invites.follow(change);
  });
  const stopNotices = context.store.feed.subscribeNotices((notice) => {
    if (notice.type !== 'planner_booked') return;
    context.live.profileNotice(notice, notice.personId, 'everyone');
    alerts.raise({
      title: 'New booking',
      body: notice.title,
      data: { kind: notice.type, itemId: notice.itemId },
      person: notice.personId,
    });
  });
  return (): void => {
    stopRows();
    stopNotices();
  };
}
