import type { HostedCall, Opening } from '../assistant-voice/outreach';
import type { HostedCaller } from '../assistant-voice/persona';
import type { LiveChannel, LiveConversation, LiveMember } from '../talk/live-sessions';
import type { LiveOpening } from '../talk/relay';
import { hostLine, once, type HostedVoiceDeps } from './hosted-call';
import { ReachRefusedError } from './reach-errors';
import { OpusSpeech } from './voice-pacing';

export type OpenLive = (channelId: string, conversation: LiveConversation) => LiveOpening;

export interface ChannelRequest {
  readonly channelId: string;
  readonly channelName: string;
  readonly label: string;
  readonly caller: HostedCaller;
  readonly opening: Opening;
}

const REFUSALS = {
  channel_missing: (name: string) => `The channel ${name} no longer exists.`,
  channel_busy: (name: string) => `Someone is talking on ${name} right now; try again shortly.`,
} as const;

function memberKey(member: LiveMember): string {
  return `${member.kind}:${member.id}`;
}

function listen(live: LiveChannel, hear: (pcm: Int16Array) => void): () => void {
  const inputs = new Map<string, OpusSpeech>();
  const stop = live.onMemberAudio((member, packet) => {
    const key = memberKey(member);
    const input = inputs.get(key) ?? new OpusSpeech(hear);
    inputs.set(key, input);
    input.packet(packet);
  });
  return (): void => {
    stop();
    inputs.forEach((input) => {
      input.free();
    });
  };
}

export async function channelConversation(
  deps: HostedVoiceDeps & { readonly openLive: OpenLive },
  request: ChannelRequest,
): Promise<HostedCall> {
  const { channelId, opening } = request;
  const opened = deps.openLive(channelId, {
    conversationId: opening.outreachId,
    label: request.label,
  });
  if (!opened.ok) {
    throw new ReachRefusedError(REFUSALS[opened.reason](request.channelName));
  }
  const { live } = opened;
  const detach: (() => void)[] = [];
  const close = once(() => {
    detach.forEach((stop) => {
      stop();
    });
    live.end();
  });
  const line = await hostLine(deps, {
    key: `channel:${channelId}`,
    caller: request.caller,
    opening,
    play: live.speak,
    closed: close,
  }).catch((cause: unknown) => {
    close();
    throw cause;
  });
  detach.push(
    listen(live, line.call.hear),
    live.onEnd(() => {
      void line.call.end('finished');
    }),
  );
  return line.call;
}
