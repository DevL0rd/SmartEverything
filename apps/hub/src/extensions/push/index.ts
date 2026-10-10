import {
  API_ENDPOINTS as E,
  assistantLabel,
  isPushed,
  type AssistantMessageRow,
  type RowChange,
  type EventRow,
  type PushStatus,
  type PushTargetRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ExtensionContext, ServerExtension } from '../../extensions';
import type { OwnerAlert, OwnerAlerts } from '../owner-alerts';
import { bound } from '../../server/router';
import type { PushCommandOutcome, PushDelivery } from './commands';
import { FcmClient, type Delivery, type PushNotification } from './fcm';
import { notificationFor, urgentEventOf } from './messages';
import { replyAudience } from './reply-audience';

export interface PushOptions {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly alerts: OwnerAlerts;
}

type Subject = Readonly<Record<string, string>>;

interface Tally {
  readonly sent: number;
  readonly failed: number;
  readonly removed: number;
  readonly reasons: readonly string[];
}

const NOTHING: Tally = { sent: 0, failed: 0, removed: 0, reasons: [] };

function added(tally: Tally, more: Tally): Tally {
  return {
    sent: tally.sent + more.sent,
    failed: tally.failed + more.failed,
    removed: tally.removed + more.removed,
    reasons: [...tally.reasons, ...more.reasons],
  };
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
}

const ASSISTANT_BODY_MAX = 180;

function assistantBody(row: AssistantMessageRow): string {
  if (row.text !== '') {
    return row.text.length > ASSISTANT_BODY_MAX
      ? `${row.text.slice(0, ASSISTANT_BODY_MAX - 1)}…`
      : row.text;
  }
  return row.attachments.some((file) => file.mime.startsWith('image/'))
    ? 'Sent a photo'
    : 'Sent a file';
}

function finishedReply(change: RowChange): AssistantMessageRow | null {
  if (change.table !== 'assistant_messages' || change.record === null) {
    return null;
  }
  const row: AssistantMessageRow = change.record;
  if (row.role !== 'responder' || (row.kind !== 'text' && row.kind !== 'update')) {
    return null;
  }
  return justFinished(change.operation, row, change.oldRecord) ? row : null;
}

function justFinished(
  operation: RowChange['operation'],
  row: AssistantMessageRow,
  old: AssistantMessageRow | null,
): boolean {
  if (operation === 'INSERT') {
    return row.state === null;
  }
  return operation === 'UPDATE' && row.state === 'answered' && old?.state !== 'answered';
}

class PushSender {
  private readonly fcm: FcmClient;
  private readonly inflight = new Set<Promise<void>>();
  status: PushStatus = {
    lastAttemptAt: null,
    lastSentAt: null,
    lastError: null,
    sent: 0,
    failed: 0,
    removed: 0,
  };

  constructor(
    private readonly context: ExtensionContext,
    private readonly options: PushOptions,
    private readonly log: Logger,
  ) {
    this.fcm = new FcmClient(options.fetch, options.now);
  }

  eventWritten(row: EventRow): void {
    if (isPushed(row.kind, row.details)) {
      this.track({ eventId: row.id, kind: row.kind }, () => this.notificationOf(row));
    }
  }

  alertRaised(alert: OwnerAlert): void {
    this.track(alert.data, () => alert);
  }

  assistantReplied(row: AssistantMessageRow): void {
    const { store, live, openCalls } = this.context;
    const subject = { kind: 'assistant_reply', messageId: row.id };
    const audience = replyAudience(row, {
      asker: (id) => store.assistantChat.find(id),
      profileOf: (clientId) => store.profiles.activeOf(clientId).id,
      listening: (clientId, stream) => live.clientListening(clientId, stream),
      callOpen: (id) => openCalls.isOpen(id),
    });
    this.track(
      subject,
      () => ({
        title: assistantLabel(store.assistantChat.settings()),
        body: assistantBody(row),
        data: { ...subject, chatId: row.chat_id, categoryId: 'assistant_reply' },
        dataOnly: true,
      }),
      audience,
    );
  }

  async settled(): Promise<void> {
    await Promise.all([...this.inflight]);
  }

  async command(
    clientId: string,
    data: Subject,
    delivery: PushDelivery,
  ): Promise<PushCommandOutcome> {
    const account = this.context.secrets.read().pushServiceAccount;
    if (account === null) {
      return { outcome: 'not_configured', reason: 'Push messages are not set up on this server.' };
    }
    const targets = this.context.store.personal
      .pushTargets()
      .filter((target) => target.client_id === clientId);
    if (targets.length === 0) {
      return {
        outcome: 'no_target',
        reason:
          'This phone has not signed up for push messages yet; open SmartEverything on it once.',
      };
    }
    const deliveries = await Promise.all(
      targets.map(async (target) => ({
        target,
        delivery: await this.safely(() => this.fcm.sendData(account, target.token, data, delivery)),
      })),
    );
    const tally = deliveries
      .map(({ target, delivery }) => this.count(target, delivery))
      .reduce(added, NOTHING);
    this.record(tally);
    this.log.info('push.command_delivered', {
      clientId,
      command: data['command'],
      sent: tally.sent,
    });
    return tally.sent > 0
      ? { outcome: 'sent' }
      : { outcome: 'failed', reason: tally.reasons.join('; ') };
  }

  private notificationOf(row: EventRow): PushNotification {
    const { store } = this.context;
    const device = row.device_id === null ? undefined : store.devices.find(row.device_id);
    const event = urgentEventOf(
      row,
      store.settings.read().home_name,
      device === undefined ? null : (device.display_name ?? device.name),
    );
    return {
      ...notificationFor(event),
      data: {
        eventId: row.id,
        kind: row.kind,
        ...(row.device_id === null ? {} : { deviceId: row.device_id }),
      },
    };
  }

  private track(
    subject: Subject,
    compose: () => PushNotification,
    accept: (target: PushTargetRow) => boolean = () => true,
  ): void {
    const delivery = this.deliver(subject, compose, accept).catch((cause: unknown) => {
      this.record({ ...NOTHING, reasons: [reasonOf(cause)] });
      this.log.error('push.failed', cause, subject);
    });
    this.inflight.add(delivery);
    void delivery.finally(() => this.inflight.delete(delivery));
  }

  private async deliver(
    subject: Subject,
    compose: () => PushNotification,
    accept: (target: PushTargetRow) => boolean,
  ): Promise<void> {
    const account = this.context.secrets.read().pushServiceAccount;
    const targets = this.context.store.personal.pushTargets().filter(accept);
    if (account === null) {
      this.record({ ...NOTHING, reasons: ['no Firebase service account is saved'] });
      this.log.warn('push.not_configured', { ...subject, targets: targets.length });
      return;
    }
    if (targets.length === 0) {
      this.log.info('push.no_targets', subject);
      return;
    }
    const notification = compose();
    const deliveries = await Promise.all(
      targets.map(async (target) => ({
        target,
        delivery: await this.sendTo(account, target, notification),
      })),
    );
    const tally = deliveries
      .map(({ target, delivery }) => this.count(target, delivery))
      .reduce(added, NOTHING);
    this.record(tally);
    this.log.info('push.delivered', {
      ...subject,
      sent: tally.sent,
      failed: tally.failed,
      removed: tally.removed,
    });
    if (tally.reasons.length > 0) {
      this.log.warn('push.not_delivered', { ...subject, reasons: tally.reasons });
    }
  }

  private sendTo(
    account: Parameters<FcmClient['send']>[0],
    target: PushTargetRow,
    notification: PushNotification,
  ): Promise<Delivery> {
    return this.safely(() => this.fcm.send(account, target.token, notification));
  }

  private async safely(send: () => Promise<Delivery>): Promise<Delivery> {
    try {
      return await send();
    } catch (cause) {
      return { outcome: 'failed', reason: reasonOf(cause) };
    }
  }

  private count(target: PushTargetRow, delivery: Delivery): Tally {
    if (delivery.outcome === 'sent') {
      return { ...NOTHING, sent: 1 };
    }
    const reasons = [delivery.reason];
    if (delivery.outcome === 'failed') {
      return { ...NOTHING, failed: 1, reasons };
    }
    try {
      this.context.store.personal.removePushTarget(target.token, target.client_id);
      this.log.info('push.target_removed', { clientId: target.client_id, reason: delivery.reason });
      return { ...NOTHING, removed: 1, reasons };
    } catch (cause) {
      this.log.error('push.target_not_removed', cause, { clientId: target.client_id });
      return { ...NOTHING, failed: 1, reasons: [...reasons, reasonOf(cause)] };
    }
  }

  private record(tally: Tally): void {
    const at = this.options.now().toISOString();
    this.status = {
      lastAttemptAt: at,
      lastSentAt: tally.sent > 0 ? at : this.status.lastSentAt,
      lastError: tally.reasons.length === 0 ? null : tally.reasons.join('; '),
      sent: this.status.sent + tally.sent,
      failed: this.status.failed + tally.failed,
      removed: this.status.removed + tally.removed,
    };
  }
}

export function pushExtension(options: PushOptions): ServerExtension {
  return (context) => {
    const log = context.log.child({ actorId: 'push' });
    const sender = new PushSender(context, options, log);
    const unsubscribe = context.store.feed.subscribe((change) => {
      if (change.table === 'events' && change.operation === 'INSERT' && change.record !== null) {
        sender.eventWritten(change.record);
      }
      const reply = finishedReply(change);
      if (reply !== null) {
        sender.assistantReplied(reply);
      }
    });
    const stopAlerts = options.alerts.listen((alert) => {
      sender.alertRaised(alert);
    });
    const detachCommands = context.pushCommands.attach((clientId, data, delivery) =>
      sender.command(clientId, data, delivery),
    );
    return Promise.resolve({
      endpoints: { readPushStatus: bound(E.readPushStatus, () => sender.status) },
      routes: [],
      stop: async (): Promise<void> => {
        unsubscribe();
        stopAlerts();
        detachCommands();
        await sender.settled();
      },
    });
  };
}
