import {
  COMPUTER_SCOPE_OFF,
  DEFAULT_COMPUTER_SCOPES,
  type ComputerScope,
  type ComputerScopes,
  type JsonValue,
  type NodeHello,
  type NodeRequest,
} from '@smarteverything/domain';
import type { ComputerControls } from './controls/controls';
import { NodeFailureError } from './node-failure';

type Verb = NodeRequest['verb'];

const SCOPE_OF: Readonly<Record<Verb, ComputerScope | null>> = {
  power: 'power',
  processes: 'processes',
  signal: 'processes',
  links: null,
  volume: null,
  mute: null,
  playback: null,
  apps: 'apps',
  open_app: 'apps',
  close_app: 'apps',
  files: 'files',
  file: 'files',
  capture: 'screenshots',
};

type SystemRequest = Extract<NodeRequest, { verb: 'power' | 'processes' | 'signal' | 'links' }>;

type MediaRequest = Extract<NodeRequest, { verb: 'volume' | 'mute' | 'playback' }>;

type DesktopRequest = Exclude<NodeRequest, SystemRequest | MediaRequest>;

function isSystem(request: NodeRequest): request is SystemRequest {
  return ['power', 'processes', 'signal', 'links'].includes(request.verb);
}

function isMedia(request: NodeRequest): request is MediaRequest {
  return ['volume', 'mute', 'playback'].includes(request.verb);
}

export class NodeRequestHandler {
  private scopes: ComputerScopes = DEFAULT_COMPUTER_SCOPES;

  constructor(private readonly controls: ComputerControls) {}

  allow(scopes: ComputerScopes): void {
    this.scopes = scopes;
  }

  allows(scope: ComputerScope): boolean {
    return this.scopes[scope];
  }

  async handle(request: NodeRequest, hello: NodeHello): Promise<JsonValue> {
    const scope = SCOPE_OF[request.verb];
    if (scope !== null && !this.scopes[scope]) {
      throw new NodeFailureError('scope_off', COMPUTER_SCOPE_OFF[scope]);
    }
    if (isSystem(request)) {
      return this.system(request, hello);
    }
    if (isMedia(request)) {
      await this.media(request);
      return null;
    }
    return this.desktop(request);
  }

  private async system(request: SystemRequest, hello: NodeHello): Promise<JsonValue> {
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
        return this.controls.files.list(request.path);
      case 'file':
        return this.controls.files.read(request.path);
      case 'capture':
        return this.controls.capture.capture(request.target);
    }
  }
}
