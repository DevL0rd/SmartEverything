import { AUTOMATION_RUNTIME_LIVE_TABLES } from '@smarteverything/domain';

const AWAITING_HUB_DEPLOY: ReadonlySet<string> = new Set<string>(AUTOMATION_RUNTIME_LIVE_TABLES);

export function awaitingHubDeploy(name: string): boolean {
  return AWAITING_HUB_DEPLOY.has(name);
}

export function deployed<T extends string>(names: readonly T[]): T[] {
  return names.filter((name) => !AWAITING_HUB_DEPLOY.has(name));
}
