import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  PowerShellFailedError,
  PowerShellSession,
  type ShellProcess,
} from '../../../src/node/collectors/windows/powershell-session';

interface Rig {
  readonly session: PowerShellSession;
  readonly writes: string[];
  readonly spawned: () => number;
  readonly killed: () => number;
  readonly exit: (reason: string) => void;
}

function rig(answer: (script: string) => readonly string[] | null): Rig {
  const writes: string[] = [];
  let spawned = 0;
  let killed = 0;
  let exit: (reason: string) => void = () => undefined;
  const session = new PowerShellSession(() => {
    spawned += 1;
    let emit: (line: string) => void = () => undefined;
    const shell: ShellProcess = {
      write: (text) => {
        writes.push(text);
        if (!text.includes('SE-END')) return;
        const lines = answer(text);
        if (lines !== null) for (const line of lines) emit(line);
      },
      onLine: (listener) => {
        emit = listener;
      },
      onExit: (listener) => {
        exit = listener;
      },
      kill: () => {
        killed += 1;
      },
    };
    return shell;
  });
  return {
    session,
    writes,
    spawned: () => spawned,
    killed: () => killed,
    exit: (reason): void => {
      exit(reason);
    },
  };
}

const NUMBERS = z.array(z.number());

afterEach(() => {
  vi.useRealTimers();
});

describe('the persistent PowerShell session', () => {
  it('sends the script inside a guarded wrapper and parses the JSON answer', async () => {
    const { session, writes } = rig(() => ['SE-OK [1,2,3]', 'SE-END']);
    await expect(session.run('Get-Numbers', NUMBERS)).resolves.toStrictEqual([1, 2, 3]);
    expect(writes[0]).toContain('UTF8');
    expect(writes[1]).toContain('$se = & { Get-Numbers }');
    expect(writes[1]).toContain('ConvertTo-Json');
  });

  it('starts one shell for many requests and answers them in order', async () => {
    const answers = ['SE-OK [1]', 'SE-OK [2]'];
    const { session, spawned } = rig(() => [answers.shift() ?? '', 'SE-END']);
    const results = await Promise.all([session.run('a', NUMBERS), session.run('b', NUMBERS)]);
    expect(results).toStrictEqual([[1], [2]]);
    expect(spawned()).toBe(1);
  });

  it('reports the PowerShell error text of a failed script', async () => {
    const { session } = rig(() => ['SE-ERR Invalid class', 'SE-END']);
    await expect(session.run('Get-Missing', NUMBERS)).rejects.toThrow(/Invalid class/u);
  });

  it('names what it received when the answer does not match the schema', async () => {
    const { session } = rig(() => ['SE-OK {"x":1}', 'SE-END']);
    await expect(session.run('Get-Thing', NUMBERS)).rejects.toThrow(
      /answered something unexpected/u,
    );
  });

  it('refuses an answer that is not JSON', async () => {
    const { session } = rig(() => ['SE-OK nope', 'SE-END']);
    await expect(session.run('Get-Thing', NUMBERS)).rejects.toThrow(/not JSON/u);
  });

  it('refuses a script that printed no answer', async () => {
    const { session } = rig(() => ['SE-END']);
    await expect(session.run('Get-Thing', NUMBERS)).rejects.toThrow(/printed no answer/u);
  });

  it('ignores other output lines such as warnings', async () => {
    const { session } = rig(() => ['WARNING: slow', 'SE-OK [4]', 'SE-END']);
    await expect(session.run('a', NUMBERS)).resolves.toStrictEqual([4]);
  });

  it('gives up on a shell that does not answer and starts a fresh one next time', async () => {
    vi.useFakeTimers();
    let silent = true;
    const { session, spawned, killed } = rig(() => (silent ? null : ['SE-OK [5]', 'SE-END']));
    const stuck = session.run('a', NUMBERS);
    const failure = expect(stuck).rejects.toThrow(/did not answer/u);
    await vi.advanceTimersByTimeAsync(20_000);
    await failure;
    expect(killed()).toBe(1);
    silent = false;
    await expect(session.run('b', NUMBERS)).resolves.toStrictEqual([5]);
    expect(spawned()).toBe(2);
  });

  it('fails the waiting requests when the shell exits', async () => {
    const { session, exit } = rig(() => null);
    const waiting = session.run('a', NUMBERS);
    const failure = expect(waiting).rejects.toBeInstanceOf(PowerShellFailedError);
    exit('exited with 1');
    await failure;
  });

  it('kills the shell when stopped', async () => {
    const { session, killed } = rig(() => ['SE-OK [1]', 'SE-END']);
    await session.run('a', NUMBERS);
    session.stop();
    expect(killed()).toBe(1);
  });
});
