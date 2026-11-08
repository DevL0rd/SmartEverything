import { describe, expect, it } from 'vitest';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { backgroundCommands, jobsSummary } from './jobs-model';

function shell(
  callId: string,
  input: unknown,
  name = 'bash',
  state: ChatTimelineTool['state'] = 'done',
): ChatTimelineTool {
  return {
    callId,
    name,
    title: 'Bash',
    state,
    detail: null,
    input: JSON.stringify(input),
    output: null,
    redacted: false,
    image_operation_id: null,
  };
}

describe('backgroundCommands', () => {
  it('lists only commands sent to the background, newest first', () => {
    const commands = backgroundCommands([
      shell('a', {
        command: 'pnpm dev',
        description: 'Start the dev server',
        run_in_background: true,
      }),
      shell('b', { command: 'ls' }),
      shell('c', { command: 'Get-Process', run_in_background: true }, 'pwsh', 'running'),
      shell('d', { command: 'tail -f log', run_in_background: true }, 'read'),
    ]);
    expect(commands).toEqual([
      { key: 'c', title: 'Get-Process', command: 'Get-Process', started: false },
      { key: 'a', title: 'Start the dev server', command: 'pnpm dev', started: true },
    ]);
  });

  it('says how many jobs run in plain words', () => {
    expect([0, 1, 3].map(jobsSummary)).toEqual(['Nothing running', '1 running', '3 running']);
  });
});
