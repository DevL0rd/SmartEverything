import {
  COMPUTER_SCOPE_OFF,
  DEFAULT_COMPUTER_SCOPES,
  NODE_VERB_SCOPES,
  type ComputerScope,
  type ComputerScopes,
  type JsonValue,
  type NodeHello,
  type NodeRequest,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import type { ComputerControls } from './controls/controls';
import { NodeFailureError } from './node-failure';
import {
  handleSystemRequest,
  isSystemGroupRequest,
  type SystemGroupRequest,
} from './system-requests';

const log = new Logger('hub.node');

export type HandledRequest = Exclude<NodeRequest, { verb: 'history' }>;

type Verb = HandledRequest['verb'];

type OwnedBy<Verbs extends Verb> = Extract<HandledRequest, { verb: Verbs }>;

type ProcessRequest = OwnedBy<'power' | 'processes' | 'signal' | 'links'>;

type MediaRequest = OwnedBy<'volume' | 'mute' | 'playback'>;

type AudioRequest = OwnedBy<'audio' | 'audio_set'>;

type DisplayRequest = OwnedBy<'displays' | 'display_set' | 'display_confirm'>;

type WindowRequest = OwnedBy<'windows' | 'window_set'>;

type MachineRequest = OwnedBy<'ring' | 'open' | 'unlock' | 'show_unlock'>;

type DesktopRequest = Exclude<
  HandledRequest,
  | ProcessRequest
  | MediaRequest
  | AudioRequest
  | DisplayRequest
  | WindowRequest
  | MachineRequest
  | SystemGroupRequest
>;

function isProcess(request: HandledRequest): request is ProcessRequest {
  return ['power', 'processes', 'signal', 'links'].includes(request.verb);
}

function isMedia(request: HandledRequest): request is MediaRequest {
  return ['volume', 'mute', 'playback'].includes(request.verb);
}

function isAudio(request: HandledRequest): request is AudioRequest {
  return ['audio', 'audio_set'].includes(request.verb);
}

function isDisplay(request: HandledRequest): request is DisplayRequest {
  return ['displays', 'display_set', 'display_confirm'].includes(request.verb);
}

function isWindow(request: HandledRequest): request is WindowRequest {
  return ['windows', 'window_set'].includes(request.verb);
}

function isMachine(request: HandledRequest): request is MachineRequest {
  return ['ring', 'open', 'unlock', 'show_unlock'].includes(request.verb);
}

export class NodeRequestHandler {
  private scopes: ComputerScopes = DEFAULT_COMPUTER_SCOPES;

  constructor(private readonly controls: ComputerControls) {}

  allow(scopes: ComputerScopes): void {
    log.info('computer.scopes_applied', { scopes: JSON.stringify(scopes) });
    this.scopes = scopes;
  }

  allows(scope: ComputerScope): boolean {
    return this.scopes[scope];
  }

  async handle(request: HandledRequest, hello: NodeHello): Promise<JsonValue> {
    const startedAt = performance.now();
    const scope = NODE_VERB_SCOPES[request.verb];
    if (scope !== null && !this.scopes[scope]) {
      log.warn('computer.request_refused', { verb: request.verb, scope, reason: 'scope_off' });
      throw new NodeFailureError('scope_off', COMPUTER_SCOPE_OFF[scope]);
    }
    log.trace('computer.request_started', { verb: request.verb, scope });
    try {
      const result = await this.dispatch(request, hello);
      log.debug('computer.request_handled', () => ({
        verb: request.verb,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return result;
    } catch (cause) {
      log.warn('computer.request_failed', {
        verb: request.verb,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: cause instanceof Error ? cause.name : typeof cause,
        reason: messageOf(cause).slice(0, 300),
      });
      throw cause;
    }
  }

  private async dispatch(request: HandledRequest, hello: NodeHello): Promise<JsonValue> {
    if (isProcess(request)) {
      return this.process(request, hello);
    }
    if (isMedia(request)) {
      await this.media(request);
      return null;
    }
    if (isAudio(request)) {
      return this.audio(request);
    }
    if (isDisplay(request)) {
      return this.displays(request);
    }
    if (isWindow(request)) {
      return this.windows(request);
    }
    if (isMachine(request)) {
      return this.machine(request);
    }
    if (isSystemGroupRequest(request)) {
      return handleSystemRequest(request, this.controls.system);
    }
    return this.desktop(request);
  }

  private async process(request: ProcessRequest, hello: NodeHello): Promise<JsonValue> {
    switch (request.verb) {
      case 'power':
        await this.controls.power.run(request.action);
        return null;
      case 'processes':
        return this.controls.processes.list(request.query);
      case 'signal':
        this.controls.processes.signal(request.pid, request.signal);
        return null;
      case 'links':
        return this.controls.links(hello);
    }
  }

  private media(request: MediaRequest): Promise<void> {
    switch (request.verb) {
      case 'volume':
        return this.controls.session.setVolume(request.level);
      case 'mute':
        return this.controls.session.setMuted(request.muted);
      case 'playback':
        return this.controls.session.playback(request.status);
    }
  }

  private audio(request: AudioRequest): Promise<JsonValue> {
    switch (request.verb) {
      case 'audio':
        return this.controls.audio.read();
      case 'audio_set':
        return this.controls.audio.change(request.change);
    }
  }

  private displays(request: DisplayRequest): Promise<JsonValue> {
    switch (request.verb) {
      case 'displays':
        return this.controls.displays.read();
      case 'display_set':
        return this.controls.displays.change(request.change, request.revert);
      case 'display_confirm':
        return this.controls.displays.confirm(request.token, request.keep);
    }
  }

  private windows(request: WindowRequest): Promise<JsonValue> {
    switch (request.verb) {
      case 'windows':
        return this.controls.windows.read();
      case 'window_set':
        return this.controls.windows.change(request.change);
    }
  }

  private async machine(request: MachineRequest): Promise<JsonValue> {
    const { machine } = this.controls;
    switch (request.verb) {
      case 'ring':
        await machine.ring(request.on);
        return null;
      case 'open':
        await machine.open(request.target);
        return null;
      case 'unlock':
        await machine.unlock();
        return null;
      case 'show_unlock':
        await machine.showUnlock();
        return null;
    }
  }

  private async desktop(request: DesktopRequest): Promise<JsonValue> {
    switch (request.verb) {
      case 'apps':
        return this.controls.apps.installed();
      case 'open_app':
        await this.controls.apps.open(request.appId);
        return null;
      case 'close_app':
        return { windows: await this.controls.apps.close(request.appId, request.force) };
      case 'files':
        return this.controls.files.list(request.path, request.cursor);
      case 'file':
        return this.controls.files.read(request.path);
      case 'file_range':
        return this.controls.files.range(request.path, request.start, request.length);
      case 'capture':
        return this.controls.capture.capture(request.target);
    }
  }
}
