import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type {
  ClaudeControl,
  ClaudeDelivery,
  ClaudePermissionMode,
  ClaudeSession,
  ClaudeStart,
  ClaudeStarted,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ClaudeController } from './controller';
import type { ControlTarget, SessionOps } from './control-plane';
import { deliverToSocket } from './session-socket';
import { DESKTOP_ID, MODEL_ID } from './controller-jobs';
import { ClaudeControlFailedError, ClaudeNotReadyError, ClaudeSendRefusedError } from './errors';
import type { ModStreams } from './streams';

export type OpenUrl = (url: string) => Promise<void>;

export interface ControlsOptions {
  readonly streams: ModStreams;
  readonly controller: ClaudeController;
  readonly open: OpenUrl;
  readonly log: Logger;
  readonly pickupMs?: number;
}

const FIRST_OPEN_MS = 15_000;

const OPEN_MS = 90_000;

const PICKUP_MS = 8000;

const CAPABILITY_OF = {
  send: 'send',
  interrupt: 'interrupt',
  set_mode: 'set_mode',
  set_model: 'set_model',
} as const;

function desktopIdOf(session: ClaudeSession, action: string): string {
  const parsed = DESKTOP_ID.safeParse(session.desktop_id);
  if (!parsed.success) {
    throw new ClaudeNotReadyError(action, 'Claude Desktop does not list this session');
  }
  return parsed.data;
}

function startLink(body: ClaudeStart): string {
  return `claude://code/new?folder=${encodeURIComponent(body.folder)}&q=${encodeURIComponent(body.text)}`;
}

export class ClaudeControls {
  constructor(private readonly options: ControlsOptions) {}

  async control(target: ControlTarget, body: ClaudeControl): Promise<ClaudeDelivery | null> {
    const { session } = target;
    const reason = session.capabilities[CAPABILITY_OF[body.action]];
    if (reason !== null) {
      throw new ClaudeNotReadyError(body.action, reason);
    }
    switch (body.action) {
      case 'send':
        this.allowSend(session);
        return this.send(target, body.text);
      case 'interrupt':
        await this.interrupt(session);
        return null;
      case 'set_mode':
        await this.setMode(session, body.permission_mode);
        return null;
      case 'set_model':
        await this.options.controller.run({
          tool: 'set_model',
          desktopId: desktopIdOf(session, 'set_model'),
          model: MODEL_ID.parse(body.model),
        });
        return null;
    }
  }

  private allowSend(session: ClaudeSession): void {
    if (session.id === this.options.controller.sessionId()) {
      throw new ClaudeSendRefusedError(
        'it is the controller session, which only carries out SmartEverything requests',
      );
    }
  }

  async start(body: ClaudeStart): Promise<ClaudeStarted> {
    if (!isAbsolute(body.folder) || !(await stat(body.folder)).isDirectory()) {
      throw new ClaudeControlFailedError(
        'start',
        'request',
        `${body.folder} is not an existing folder`,
      );
    }
    const note = await this.startWithController(body);
    if (note.started) {
      return { method: 'controller', state: 'started', detail: note.detail };
    }
    await this.options.open(startLink(body)).catch((cause: unknown) => {
      throw new ClaudeControlFailedError(
        'start',
        'deep link',
        cause instanceof Error ? cause.message : String(cause),
      );
    });
    return {
      method: 'deep_link',
      state: 'prefilled',
      detail: `Claude Desktop opened its new-session page; press Send there. ${note.detail}`.trim(),
    };
  }

  private async startWithController(
    body: ClaudeStart,
  ): Promise<{ started: boolean; detail: string }> {
    const state = this.options.controller.state();
    if (state !== 'ready' && state !== 'busy') {
      return { started: false, detail: `The controller session was not used: ${state}.` };
    }
    try {
      const detail = await this.options.controller.run({
        tool: 'start',
        folder: body.folder,
        text: body.text,
      });
      return { started: true, detail };
    } catch (cause) {
      if (!(cause instanceof ClaudeControlFailedError || cause instanceof ClaudeNotReadyError)) {
        throw cause;
      }
      this.options.log.warn('start.controller_failed', { reason: cause.message });
      return { started: false, detail: `The controller could not start it: ${cause.message}` };
    }
  }

  private async send(target: ControlTarget, text: string): Promise<ClaudeDelivery> {
    const { session, ops } = target;
    let socket = target.socket;
    if (session.state === 'stopped') {
      await this.resume(session, ops);
      socket = ops.socketOf(session.id);
    }
    if (this.options.streams.has(session.id)) {
      await this.options.streams.request(session.id, { op: 'send', text });
      return 'confirmed';
    }
    if (socket !== null) {
      const delivered = await this.deliverOrFallBack(session, ops, socket, text);
      if (delivered !== null) {
        return delivered;
      }
    }
    await this.options.controller.run({
      tool: 'send',
      desktopId: desktopIdOf(session, 'send'),
      text,
    });
    return 'confirmed';
  }

  private async deliverOrFallBack(
    session: ClaudeSession,
    ops: SessionOps,
    socket: string,
    text: string,
  ): Promise<ClaudeDelivery | null> {
    try {
      return await this.deliver(session, ops, socket, text);
    } catch (cause) {
      const state = this.options.controller.state();
      if (!(cause instanceof ClaudeControlFailedError) || (state !== 'ready' && state !== 'busy')) {
        throw cause;
      }
      this.options.log.warn('send.socket_failed', { reason: cause.reason });
      return null;
    }
  }

  private async resume(session: ClaudeSession, ops: SessionOps): Promise<void> {
    const url = `claude://resume?session=${session.id}`;
    for (const waitMs of [FIRST_OPEN_MS, OPEN_MS]) {
      await this.options.open(url).catch((cause: unknown) => {
        throw new ClaudeControlFailedError(
          'send',
          'deep link',
          cause instanceof Error ? cause.message : String(cause),
        );
      });
      if (await ops.whenRunning(session.id, waitMs)) {
        return;
      }
    }
    throw new ClaudeControlFailedError(
      'send',
      'deep link',
      'Claude Desktop did not open the session',
    );
  }

  private async deliver(
    session: ClaudeSession,
    ops: SessionOps,
    socket: string,
    text: string,
  ): Promise<ClaudeDelivery> {
    const before = ops.userMessages(session.id);
    await deliverToSocket(socket, text);
    if (await ops.whenUserMessage(session.id, before, this.options.pickupMs ?? PICKUP_MS)) {
      return 'confirmed';
    }
    if (session.state === 'busy') {
      return 'queued_unverified';
    }
    throw new ClaudeControlFailedError(
      'send',
      'session socket',
      'the session did not show the message; its socket may need a peer key, which SmartEverything does not read',
    );
  }

  private async interrupt(session: ClaudeSession): Promise<void> {
    if (this.options.streams.has(session.id)) {
      await this.options.streams.request(session.id, { op: 'interrupt' });
      return;
    }
    await this.options.controller.run({
      tool: 'interrupt',
      desktopId: desktopIdOf(session, 'interrupt'),
    });
  }

  private async setMode(session: ClaudeSession, mode: ClaudePermissionMode): Promise<void> {
    if (mode === 'dontAsk') {
      throw new ClaudeNotReadyError('set_mode', 'Claude Desktop cannot be told to use dontAsk');
    }
    if (session.permission_mode === mode) {
      return;
    }
    await this.options.controller.run({
      tool: 'set_mode',
      desktopId: desktopIdOf(session, 'set_mode'),
      mode,
    });
  }
}
