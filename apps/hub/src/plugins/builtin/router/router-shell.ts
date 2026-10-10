export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RouterShell {
  readonly collect: (line: string) => Promise<string>;
  readonly run: (command: string) => Promise<RunResult>;
  readonly close: () => void;
}

class RouterCommandError extends Error {
  override readonly name = 'RouterCommandError';
}

export async function runChecked(shell: RouterShell, command: string): Promise<string> {
  const result = await shell.run(command);
  if (result.code !== 0) {
    const reason = result.stderr.length > 0 ? result.stderr : `exit code ${String(result.code)}`;
    throw new RouterCommandError(`The router refused the command: ${reason}`);
  }
  return result.stdout;
}
