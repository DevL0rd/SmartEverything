export const RUNTIMES = ['app', 'edge', 'db', 'tool', 'hub', 'desktop'] as const;

export type Runtime = (typeof RUNTIMES)[number];

const SCOPE = /^(app|edge|db|tool|hub|desktop)\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

export class InvalidScopeError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      'a scope names the runtime that emitted the line and the area it belongs to, such as ' +
        '"app.devices", "edge.health" or "db.automations". The runtime is one of ' +
        `${RUNTIMES.join(', ')}. Received "${received}"`,
    );
    this.name = 'InvalidScopeError';
    this.received = received;
  }
}

export function isScope(candidate: string): boolean {
  return SCOPE.test(candidate);
}

export function assertScope(candidate: string): string {
  if (!isScope(candidate)) {
    throw new InvalidScopeError(candidate);
  }
  return candidate;
}

export function runtimeOf(scope: string): Runtime {
  const matched = SCOPE.exec(scope);
  const runtime = RUNTIMES.find((candidate) => candidate === matched?.[1]);
  if (runtime === undefined) {
    throw new InvalidScopeError(scope);
  }
  return runtime;
}

export function areaOf(scope: string): string {
  const matched = SCOPE.exec(scope);
  const area = matched?.[2];
  if (area === undefined) {
    throw new InvalidScopeError(scope);
  }
  return area;
}
