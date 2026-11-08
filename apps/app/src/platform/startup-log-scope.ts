export interface StartupScope {
  readonly scope: string;
  readonly since: number;
}

interface StartupScopeOptions {
  readonly bootAt: number;
  readonly now: () => number;
  readonly read: () => Promise<StartupScope | null>;
  readonly write: (scope: StartupScope) => Promise<void>;
  readonly restore: (scope: StartupScope, before: number) => Promise<boolean>;
  readonly clear: () => void;
}

export async function confirmStartupScope(
  options: StartupScopeOptions,
  scope: string,
  current: () => boolean,
): Promise<void> {
  if (!current()) return;
  const prior = await options.read();
  if (!current()) return;
  if (prior?.scope === scope && prior.since >= options.bootAt) return;
  if (prior?.scope === scope && !(await options.restore(prior, options.bootAt))) return;
  if (!current()) return;
  options.clear();
  await options.write({ scope, since: options.now() });
}
