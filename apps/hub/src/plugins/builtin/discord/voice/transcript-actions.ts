import type { DiscordServices } from '../services';
import { plain, type LocalAction, type LocalOutput } from '../tools/action-tool';
import { UnknownCallError, summaryOf, type CallSummary } from './calls';
import type { VoiceTools } from './tools';

const CALLS_SHOWN = 200;

export function summaryFor(tools: VoiceTools, callId: string): CallSummary {
  const session = tools.transcripts.find(callId);
  const summary = session === null ? null : summaryOf(session);
  if (summary === null) throw new UnknownCallError(callId);
  return summary;
}

export function transcriptActions(
  services: DiscordServices,
  tools: VoiceTools,
): readonly LocalAction[] {
  return [
    {
      action: 'calls',
      description:
        'Active and up to 200 recent approved voice calls, newest first, with participants and line counts. Read a call’s lines with read_transcripts, passing its callId as sessionId.',
      shape: {},
      run: async (_args, caller): Promise<LocalOutput> => {
        await services.authority.access(caller, undefined);
        return plain(
          tools.transcripts
            .list(CALLS_SHOWN)
            .map(summaryOf)
            .filter(
              (summary): summary is CallSummary =>
                summary !== null && services.policy.guildAllowed(summary.guildId),
            ),
        );
      },
    },
  ];
}
