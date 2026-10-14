import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { env, getuid, platform } from 'node:process';
import { CodexRuntimeError } from './errors';
export interface CodexProcessOptions {
  readonly executable?: string;
  readonly controlSocket?: string;
}
const ENVIRONMENT_KEYS = [
  'HOME',
  'USERPROFILE',
  'PATH',
  'SystemRoot',
  'TEMP',
  'TMP',
  'XDG_RUNTIME_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'DBUS_SESSION_BUS_ADDRESS',
  'CODEX_HOME',
  'LANG',
] as const;
function environment(): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const key of ENVIRONMENT_KEYS) if (env[key] !== undefined) safe[key] = env[key];
  return safe;
}
export async function launchCodex(
  options: CodexProcessOptions,
  mode: 'control' | 'provider',
): Promise<ChildProcessWithoutNullStreams> {
  const executable = options.executable ?? 'codex';
  if (options.executable !== undefined && !isAbsolute(executable))
    throw new CodexRuntimeError('launch', 'Configured Codex executable must be absolute.');
  if (mode === 'provider')
    return spawn(
      executable,
      ['-c', 'model_provider="openai"', 'app-server', '--listen', 'stdio://'],
      { shell: false, windowsHide: true, env: environment(), stdio: 'pipe' },
    );
  const socket = options.controlSocket;
  if (socket === undefined)
    throw new CodexRuntimeError(
      'control',
      'Configure an owning Codex app-server control socket on this computer.',
    );
  if (!isAbsolute(socket) || platform === 'win32')
    throw new CodexRuntimeError(
      'control',
      'Codex owner control currently requires an absolute Unix socket path.',
    );
  await validateSocket(socket);
  return spawn(executable, ['app-server', 'proxy', '--sock', socket], {
    shell: false,
    windowsHide: true,
    env: environment(),
    stdio: 'pipe',
  });
}

async function validateSocket(socket: string): Promise<void> {
  const stat = await lstat(socket);
  if (
    !stat.isSocket() ||
    stat.isSymbolicLink() ||
    stat.uid !== getuid?.() ||
    (stat.mode & 0o077) !== 0
  )
    throw new CodexRuntimeError(
      'control',
      'The Codex control socket must be a private socket owned by this user.',
    );
  if ((await realpath(socket)) !== socket)
    throw new CodexRuntimeError(
      'control',
      'The Codex control socket cannot pass through symbolic links.',
    );
}
