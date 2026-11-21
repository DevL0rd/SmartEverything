import {
  ApiError,
  PLANNER_RSVP_PATHS,
  buildPath,
  type LiveChange,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { MailResult } from '../../mail/message';
import type { MailService } from '../../mail/service';
import type { Store } from '../../store/store';
import { itipText } from './itip';
import { inviteText, type InviteKind, type InviteLinks } from './content';
import { inviteToken, inviteTokenHash } from './token';

export interface InviteDeps {
  readonly store: Pick<Store, 'host'>;
  readonly mail: Pick<MailService, 'configured' | 'fromAddress' | 'fromName' | 'send'>;
  readonly key: Uint8Array;
  readonly origin: () => string;
  readonly now: () => Date;
  readonly log: Logger;
}

const SPEC_FIELDS = [
  'title',
  'notes',
  'location',
  'start_local',
  'end_local',
  'time_zone',
  'all_day',
  'rrule',
  'exdates',
] as const;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedSpec(before: PlannerItemRow, after: PlannerItemRow): boolean {
  return SPEC_FIELDS.some((field) => !sameValue(before[field], after[field]));
}

function isCancelled(item: PlannerItemRow): boolean {
  return item.deleted_at !== null || item.status === 'cancelled';
}

function emailGuest(guest: PlannerGuestRow): boolean {
  return guest.kind === 'email' && guest.email !== null;
}

export class InviteService {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly deps: InviteDeps) {}

  idle(): Promise<void> {
    return this.tail;
  }

  follow(change: LiveChange): void {
    if (change.table === 'planner_guests') this.followGuest(change);
    else if (change.table === 'planner_items') this.followItem(change);
  }

  linksOf(guestId: string): InviteLinks {
    const base = `${this.deps.origin().replace(/\/+$/, '')}${this.rsvpPathOf(guestId)}`;
    return {
      yes: `${base}?answer=yes`,
      maybe: `${base}?answer=maybe`,
      no: `${base}?answer=no`,
    };
  }

  publicLinkOf(guestId: string): string {
    return `${this.deps.origin().replace(/\/+$/, '')}${this.rsvpPathOf(guestId)}`;
  }

  rsvpPathOf(guestId: string): string {
    return buildPath(PLANNER_RSVP_PATHS.page, { token: inviteToken(this.deps.key, guestId) });
  }

  async prepare(guestId: string): Promise<void> {
    await this.deps.store.host.call(
      'plannerGuests',
      'replaceToken',
      guestId,
      inviteTokenHash(this.deps.key, guestId),
    );
  }

  async deliver(guestId: string, kind: InviteKind): Promise<PlannerGuestRow> {
    const { host } = this.deps.store;
    const guest = await host.call('plannerGuests', 'byId', guestId);
    const item = await host.call('plannerItems', 'findAny', guest.item_id);
    if (item === undefined) throw new ApiError('not_found', 'That event no longer exists.');
    await this.send(guest, item, kind);
    return host.call('plannerGuests', 'byId', guestId);
  }

  private followGuest(change: Extract<LiveChange, { table: 'planner_guests' }>): void {
    const { record, oldRecord } = change;
    if (record !== null && oldRecord === null && emailGuest(record)) {
      this.enqueue(() => this.inviteNew(record));
    } else if (record === null && oldRecord !== null && emailGuest(oldRecord)) {
      this.enqueue(() => this.cancelRemoved(oldRecord));
    }
  }

  private followItem(change: Extract<LiveChange, { table: 'planner_items' }>): void {
    const { record, oldRecord } = change;
    if (record === null || oldRecord === null || record.kind !== 'event') return;
    const masterId = record.series_id ?? record.id;
    if (isCancelled(record) !== isCancelled(oldRecord)) {
      if (record.series_id === null) {
        this.enqueue(() => this.reach(record, isCancelled(record) ? 'cancel' : 'invite'));
      }
    } else if (!isCancelled(record) && changedSpec(oldRecord, record)) {
      this.enqueue(() => this.updated(masterId));
    }
  }

  private enqueue(work: () => Promise<void>): void {
    this.tail = this.tail.then(work).catch((cause: unknown) => {
      this.deps.log.error('invite.failed', cause);
    });
  }

  private async inviteNew(guest: PlannerGuestRow): Promise<void> {
    const item = await this.deps.store.host.call('plannerItems', 'findAny', guest.item_id);
    if (item === undefined || isCancelled(item) || item.created_by === 'booking') return;
    await this.send(guest, item, 'invite');
  }

  private async cancelRemoved(guest: PlannerGuestRow): Promise<void> {
    const item = await this.deps.store.host.call('plannerItems', 'findAny', guest.item_id);
    if (item === undefined || isCancelled(item)) return;
    await this.sendTo(guest, item, 'cancel');
  }

  private async updated(masterId: string): Promise<void> {
    const bumped = await this.deps.store.host.write('plannerInviteBump', { masterId });
    if (bumped !== null) await this.reach(bumped, 'update');
  }

  private async reach(item: PlannerItemRow, kind: InviteKind): Promise<void> {
    for (const guest of await this.deps.store.host.call('plannerGuests', 'forItem', item.id)) {
      if (emailGuest(guest)) await this.send(guest, item, kind);
    }
  }

  private async send(
    guest: PlannerGuestRow,
    item: PlannerItemRow,
    kind: InviteKind,
  ): Promise<void> {
    const collection = await this.deps.store.host.call(
      'plannerCollections',
      'findAny',
      item.collection_id,
    );
    if (collection?.source === 'google') {
      await this.settle(guest, 'google', null);
      return;
    }
    await this.prepare(guest.id);
    if (!this.deps.mail.configured) {
      if (kind !== 'cancel') await this.settle(guest, 'link_only', null);
      return;
    }
    await this.sendTo(guest, item, kind);
  }

  private async sendTo(
    guest: PlannerGuestRow,
    item: PlannerItemRow,
    kind: InviteKind,
  ): Promise<void> {
    const { mail, store } = this.deps;
    const address = mail.fromAddress();
    if (guest.email === null || address === null) return;
    const result = await this.attempt(guest, item, kind, address);
    if (kind === 'cancel') return;
    const current = await store.host.call('plannerGuests', 'find', guest.id);
    if (current === undefined) return;
    if (result.outcome === 'sent') await this.settle(current, 'sent', null);
    else await this.settle(current, 'failed', result.detail);
  }

  private async attempt(
    guest: PlannerGuestRow,
    item: PlannerItemRow,
    kind: InviteKind,
    address: string,
  ): Promise<MailResult> {
    try {
      return await this.mailTo(guest, item, kind, address);
    } catch (cause) {
      if (cause instanceof ApiError) return { outcome: 'failed', detail: cause.message };
      throw cause;
    }
  }

  private async mailTo(
    guest: PlannerGuestRow,
    item: PlannerItemRow,
    kind: InviteKind,
    address: string,
  ): Promise<MailResult> {
    const { mail, store, now } = this.deps;
    const { organiser, guests, overrides } = await store.host.read('plannerInviteMail', { item });
    const copy = inviteText({
      kind,
      item,
      organiser,
      guestName: guest.name,
      links: this.linksOf(guest.id),
    });
    const method = kind === 'cancel' ? 'CANCEL' : 'REQUEST';
    return mail.send({
      kind,
      to: guest.email ?? '',
      ...copy,
      calendar: {
        method,
        filename: kind === 'cancel' ? 'cancel.ics' : 'invite.ics',
        content: itipText(item, overrides, guests, {
          method,
          organiser: { address, name: mail.fromName() },
          now: now(),
        }),
      },
    });
  }

  private async settle(
    guest: PlannerGuestRow,
    delivery: PlannerGuestRow['delivery'],
    detail: string | null,
  ): Promise<void> {
    if (guest.delivery === delivery && guest.delivery_detail === detail) return;
    await this.deps.store.host.call('plannerGuests', 'update', guest.id, {
      delivery,
      delivery_detail: detail,
    });
  }
}
