import {
  PROCESS_DETAIL,
  PROCESS_LIST,
  PROCESS_ORDERS,
  PROCESS_SIGNALS,
  PROCESS_SORTS,
  type ProcessSignal,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, type OperatingContext } from './acting';
import { compactProcess, compactProcesses } from './computer-compact';
import { COMPUTER_ID } from './computer-flat';
import { READS, WRITES, defineTool, type Tool } from './registry';

const PID = z.int().positive().describe('A program’s pid from list_processes');

const LIST_INPUT = z.strictObject({
  deviceId: COMPUTER_ID,
  pid: PID.optional().describe('Give this one program in detail instead of the list'),
  sort: z.enum(PROCESS_SORTS).optional().describe('Default cpu'),
  order: z.enum(PROCESS_ORDERS).optional(),
  search: z.string().trim().min(1).optional().describe('Only programs whose name matches'),
  tree: z.boolean().optional().describe('Group children under their parent'),
  cursor: z.int().nonnegative().optional().describe('next from the previous answer'),
});

const END_INPUT = z
  .strictObject({
    deviceId: COMPUTER_ID,
    pid: PID,
    signal: z.enum([...PROCESS_SIGNALS, 'priority']),
    nice: z
      .int()
      .min(-20)
      .max(19)
      .optional()
      .describe(
        'priority only: 0 normal, 10 low, 19 lowest; raising above the current level needs permission',
      ),
  })
  .refine((input) => input.signal !== 'priority' || input.nice !== undefined, {
    message: 'nice is required for priority',
    path: ['nice'],
  });

const SIGNAL_PAST: Readonly<Record<ProcessSignal, string>> = {
  end: 'asked to end',
  force: 'force quit',
  stop: 'paused',
  continue: 'resumed',
};

type Fields = Record<string, unknown>;

export async function listPrograms(
  context: OperatingContext,
  { deviceId, pid, tree, ...query }: z.output<typeof LIST_INPUT>,
): Promise<Fields> {
  if (pid !== undefined) {
    const detail = await operate(context, 'readComputerProcess', {
      params: { deviceId, pid: String(pid) },
    });
    return compactProcess(PROCESS_DETAIL.parse(detail));
  }
  const list = await operate(context, 'listComputerProcesses', {
    params: { deviceId },
    query: { ...query, ...(tree === undefined ? {} : { tree: String(tree) }) },
  });
  return compactProcesses(PROCESS_LIST.parse(list));
}

export async function endProgram(
  context: OperatingContext,
  { deviceId, pid, signal, nice }: z.output<typeof END_INPUT>,
): Promise<Fields> {
  if (signal === 'priority') {
    await operate(context, 'prioritiseComputerProcess', {
      params: { deviceId, pid: String(pid) },
      body: { nice },
    });
    return { ok: true, summary: `Program ${String(pid)} priority set to ${String(nice)}` };
  }
  await operate(context, 'signalComputerProcess', { params: { deviceId }, body: { pid, signal } });
  return { ok: true, summary: `Program ${String(pid)} ${SIGNAL_PAST[signal]}` };
}

export const COMPUTER_PROGRAM_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_processes',
    input: LIST_INPUT,
    annotations: READS,
    run: async (context, request) => ({ structured: await listPrograms(context, request) }),
  }),
  defineTool({
    name: 'end_process',
    input: END_INPUT,
    annotations: { ...WRITES, destructiveHint: true },
    answer: true,
    run: async (context, request) => ({ structured: await endProgram(context, request) }),
  }),
];
