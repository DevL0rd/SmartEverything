import { HarnessRuntimeError } from '../host/errors';

type StartupStage = 'boot' | 'catalogue' | 'composition' | 'tools' | 'register';
let stage: StartupStage | 'ready' = 'boot';

export function setStartupStage(value: StartupStage | 'ready'): void {
  stage = value;
  if (value !== 'ready') process.stderr.write(`SMARTEVERYTHING_STARTUP_PROGRESS:${value}\n`);
}

export function startupFailure(cause: unknown): string | null {
  if (stage === 'ready') return null;
  const code = cause instanceof HarnessRuntimeError ? cause.code : null;
  return `SMARTEVERYTHING_STARTUP:${stage}:${category(cause, code)}`;
}

function category(cause: unknown, code: string | null): string {
  if (code === 'runtime_unavailable' || code === 'route_unavailable') return code;
  if (cause instanceof TypeError) return 'network_failed';
  if (cause instanceof SyntaxError || (cause instanceof Error && cause.name === 'ZodError'))
    return 'invalid_input';
  return 'operation_failed';
}
