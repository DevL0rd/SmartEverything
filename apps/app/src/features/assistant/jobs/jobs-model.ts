import { z } from 'zod';
import {
  SHELL_TOOL_NAMES,
  type AiHarnessSession,
  type ChatTimelineTool,
} from '@smarteverything/domain';
import { reportedRecord } from '../model/tool-presentation-text';

const BACKGROUND_INPUT = z.object({
  command: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  run_in_background: z.literal(true),
});

export interface BackgroundCommand {
  readonly key: string;
  readonly title: string;
  readonly command: string;
  readonly started: boolean;
}

export function backgroundCommands(
  tools: readonly ChatTimelineTool[],
): readonly BackgroundCommand[] {
  return [...tools].reverse().flatMap((tool) => {
    if (!SHELL_TOOL_NAMES.has(tool.name)) return [];
    const parsed = BACKGROUND_INPUT.safeParse(reportedRecord(tool.input));
    if (!parsed.success) return [];
    return [
      {
        key: tool.callId,
        title: parsed.data.description ?? parsed.data.command,
        command: parsed.data.command,
        started: tool.state === 'done',
      },
    ];
  });
}

export function runningJobs(session: Pick<AiHarnessSession, 'work'> | undefined): {
  readonly total: number;
  readonly helpers: number;
} {
  const shells = new Set<string>();
  const helpers = new Set<string>();
  for (const work of session?.work ?? []) {
    if (work.kind === 'shell') shells.add(work.id);
    if (work.kind === 'child') helpers.add(work.id);
  }
  return { total: shells.size + helpers.size, helpers: helpers.size };
}

export function jobsSummary(running: number): string {
  if (running === 0) return 'Nothing running';
  return running === 1 ? '1 running' : `${String(running)} running`;
}
