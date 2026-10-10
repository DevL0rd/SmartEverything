import type { InboundMessage } from '@smarteverything/domain';
import type { PluginContext } from '../../contract';
import type { CommandSet } from '../commands';
import type { DiscordLink } from '../link';
import type { Person } from '../person';
import type { DiscordServices } from '../services';
import type { DiscordSettings } from '../settings';
import type { Status } from '../status';
import type { Typing } from '../typing';
import { voiceCommands } from './commands';
import { CallText } from './context';
import { GatewayVoice } from './gateway-voice';
import type { VoiceBackend } from './link';
import { Occupancy } from './occupancy';
import { Roster } from './roster';
import { VoiceEvents } from './events';
import { callPeople } from './service-parts';
import { VoiceService } from './service';
import { TypedRequests } from './typed';
import type { VoiceTools } from './tools';

export interface VoiceInput {
  readonly ctx: PluginContext<DiscordSettings>;
  readonly services: DiscordServices;
  readonly link: Pick<DiscordLink, 'send'>;
  readonly voice: VoiceBackend;
  readonly typing: Typing;
  readonly status: Status;
  readonly guildNames: ReadonlyMap<string, string>;
  readonly post: (message: InboundMessage) => void;
  readonly report: (cause: unknown) => void;
}

export interface VoiceParts {
  readonly service: VoiceService;
  readonly events: VoiceEvents;
  readonly commands: readonly CommandSet[];
  readonly tools: VoiceTools;
}

function ownerOf(input: VoiceInput): () => Person | null {
  const { ctx, services } = input;
  return (): Person | null => {
    const owner = ctx.people.list().find((item) => item.status === 'owner');
    return owner === undefined ? null : services.directory.person(owner.external_id);
  };
}

interface Core {
  readonly occupancy: Occupancy;
  readonly roster: Roster;
  readonly gateway: GatewayVoice;
  readonly calls: CallText;
}

function coreOf(input: VoiceInput): Core {
  const { ctx, services, report } = input;
  const occupancy = new Occupancy(() => services.identity.botId);
  const roster = new Roster(services.directory, services.rest, Date.now);
  return {
    occupancy,
    roster,
    gateway: new GatewayVoice({
      send: (guildId, payload) => input.link.send(guildId, payload),
      report,
    }),
    calls: new CallText({
      people: callPeople(roster, occupancy),
      contextMinutes: ctx.settings.voice_context_minutes,
      reuseMinutes: (): number => ctx.assistant.settings().reuseChatMinutes,
      now: Date.now,
    }),
  };
}

function serviceOf(input: VoiceInput, core: Core): VoiceService {
  const { ctx, services, report, status } = input;
  return new VoiceService({
    settings: ctx.settings,
    voice: ctx.voice,
    policy: services.policy,
    channels: services.channels,
    roster: core.roster,
    occupancy: core.occupancy,
    connect: input.voice.connect,
    issue: input.voice.issue,
    gateway: core.gateway,
    identity: services.identity,
    assistant: ctx.assistant,
    rest: services.rest,
    connected: (): boolean => status.view().gateway === 'ready',
    texts: core.calls,
    typed: new TypedRequests({
      services,
      guildNames: input.guildNames,
      typing: input.typing,
      calls: core.calls,
      post: input.post,
      report,
    }),
    owner: ownerOf(input),
    publish: (list): void => {
      status.calls(list);
    },
    now: Date.now,
    report,
  });
}

export function assembleVoice(input: VoiceInput): VoiceParts {
  const { ctx, services, report } = input;
  const core = coreOf(input);
  const service = serviceOf(input, core);
  input.voice.onIssue(() => {
    input.status.voiceNotice(input.voice.issue());
  });
  return {
    service,
    events: new VoiceEvents({
      occupancy: core.occupancy,
      gateway: core.gateway,
      roster: core.roster,
      service,
      selfId: (): string => services.identity.botId,
      report,
    }),
    commands: voiceCommands(service),
    tools: {
      service,
      transcripts: ctx.voice.transcripts,
      botName: (): string => ctx.assistant.settings().name ?? 'Assistant',
    },
  };
}
