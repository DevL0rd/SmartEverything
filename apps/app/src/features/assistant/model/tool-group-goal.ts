import type { ChatTimelineTool } from '@smarteverything/domain';
import { toolOutcome } from './tool-outcome';
import { toolActionTitle, toolVerb } from './tool-presentation';
import { plural } from '../../../format/text';

export type ActivityTone = 'live' | 'done' | 'failed' | 'stopped';

export interface ActivitySummary {
  readonly tone: ActivityTone;
  readonly lead: string;
  readonly verbs: readonly string[];
  readonly failedNote: string | null;
}

export interface ActivityInput {
  readonly tools: readonly ChatTimelineTool[];
  readonly live: boolean;
  readonly stopped: boolean;
  readonly thinking: boolean;
  readonly thoughtSeconds: number | null;
  readonly pluginName: (id: string) => string | null;
}

export function toolGroupVerbs(tools: readonly ChatTimelineTool[]): readonly string[] {
  return [
    ...new Set(
      tools.flatMap((tool) => {
        const verb = toolVerb(tool);
        return verb === null ? [] : [verb];
      }),
    ),
  ];
}

function liveSummary(input: ActivityInput): ActivitySummary {
  const running = input.tools.findLast((tool) => toolOutcome(tool, true) === 'running');
  const lead =
    running === undefined
      ? input.thinking || input.tools.length === 0
        ? 'Thinking'
        : 'Working'
      : toolActionTitle(running, input.pluginName);
  return { tone: 'live', lead, verbs: [], failedNote: null };
}

function thoughtLead(seconds: number | null): string {
  return seconds === null ? 'Thought' : `Thought for ${String(Math.max(1, Math.round(seconds)))} s`;
}

export function activitySummary(input: ActivityInput): ActivitySummary {
  if (input.live) return liveSummary(input);
  const { tools } = input;
  if (tools.length === 0) {
    return { tone: 'done', lead: thoughtLead(input.thoughtSeconds), verbs: [], failedNote: null };
  }
  const outcomes = tools.map((tool) => toolOutcome(tool, false));
  const failed = outcomes.filter((outcome) => outcome === 'failed').length;
  const stopped =
    input.stopped || outcomes.some((outcome) => outcome === 'interrupted' || outcome === 'unknown');
  const verbs = toolGroupVerbs(tools);
  const failedNote = failed === 0 ? null : `${String(failed)} failed`;
  if (stopped) {
    return {
      tone: 'stopped',
      lead: `Stopped after ${plural(tools.length, 'tool')}`,
      verbs,
      failedNote,
    };
  }
  return {
    tone: failed === 0 ? 'done' : 'failed',
    lead: `Used ${plural(tools.length, 'tool')}`,
    verbs,
    failedNote,
  };
}

export function activitySummaryLine(summary: ActivitySummary, verbCount: number): string {
  const verbs = summary.verbs.slice(0, verbCount).join(', ');
  return [summary.lead, verbs, summary.failedNote]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}
