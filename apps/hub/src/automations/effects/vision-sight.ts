import type { HubToolResult } from '../../ai-tools/hub-tool';
import type { IntegrationPorts } from '../integration-effects';
import { IntegrationError } from './integration-error';
import type { OneShotPicture } from './one-shot-model';
import { ToolActionError } from './tool';

export interface SightCaller {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
}

export const VISION_SOURCES = [
  'camera',
  'computer_screen',
  'computer_window',
  'phone_screen',
] as const;

type VisionSource = (typeof VISION_SOURCES)[number];

type SightArgs = Readonly<Record<string, string>>;

export interface VisionLook {
  readonly image?: string | undefined;
  readonly camera?: string | undefined;
  readonly source?: VisionSource | undefined;
  readonly computer?: string | undefined;
  readonly window?: string | undefined;
  readonly phone?: string | undefined;
}

type Look =
  | { readonly kind: 'picture'; readonly id: string }
  | { readonly kind: 'camera'; readonly camera: string }
  | { readonly kind: 'sight'; readonly args: SightArgs };

function problem(message: string): IntegrationError {
  return new IntegrationError('Invalid', message);
}

function sightArgs(source: string, device: string, id: string | undefined): SightArgs {
  return id === undefined ? { source } : { source, [device]: id };
}

const SIGHT_ARGS: Readonly<
  Record<Exclude<VisionSource, 'camera'>, (call: VisionLook) => SightArgs>
> = {
  computer_screen: (call) => sightArgs('desktop_screen', 'computer', call.computer),
  computer_window: (call) => {
    if (call.window === undefined) throw problem('Say which window to look at.');
    return { ...sightArgs('desktop_window', 'computer', call.computer), window: call.window };
  },
  phone_screen: (call) => sightArgs('phone_screenshot', 'phone', call.phone),
};

function sightOf(call: VisionLook): Look {
  const source = call.source ?? (call.camera === undefined ? undefined : 'camera');
  if (source === undefined) throw problem('Give a picture, or pick what to look at.');
  if (source !== 'camera') return { kind: 'sight', args: SIGHT_ARGS[source](call) };
  if (call.camera === undefined) throw problem('Pick the camera to look at.');
  return { kind: 'camera', camera: call.camera };
}

function lookOf(call: VisionLook): Look {
  if (call.image === undefined) return sightOf(call);
  if (call.source !== undefined || call.camera !== undefined) {
    throw problem('Give either a picture or something to look at, not both.');
  }
  return { kind: 'picture', id: call.image };
}

function pictureOf(result: HubToolResult): OneShotPicture {
  const error = result.response['error'];
  if (typeof error === 'string') throw new ToolActionError(error);
  const [first] = result.pictures;
  if (first === undefined) {
    throw new IntegrationError('Unreachable', 'Nothing came back to look at.');
  }
  return { mimeType: first.mimeType, base64: first.data.toString('base64') };
}

async function sightPicture(
  tools: IntegrationPorts['tools'],
  who: SightCaller,
  args: SightArgs,
): Promise<OneShotPicture> {
  const check = tools.check('sight_look', args);
  if (!check.ok) throw new ToolActionError(check.reason);
  const result = await tools.call('sight_look', args, {
    profileId: who.profileId,
    role: who.role,
    chatId: null,
    via: 'automation',
    clientId: null,
  });
  return pictureOf(result);
}

export async function visionPicture(
  ports: Pick<IntegrationPorts, 'pictures' | 'tools'>,
  call: VisionLook,
  who: SightCaller,
): Promise<OneShotPicture> {
  const look = lookOf(call);
  switch (look.kind) {
    case 'picture':
      return ports.pictures.load(look.id);
    case 'camera':
      return ports.pictures.load((await ports.pictures.take(look.camera, 'full')).id);
    case 'sight':
      return sightPicture(ports.tools, who, look.args);
  }
}
