import { join } from 'node:path';

export interface AgentEnvironment {
  readonly runtimeDirectory: string | null;
  readonly localAppData: string | null;
  readonly home: string;
}

export function sessionAgentDirectory(
  platform: NodeJS.Platform,
  environment: AgentEnvironment,
): string | null {
  if (platform === 'linux') {
    return environment.runtimeDirectory === null
      ? null
      : join(environment.runtimeDirectory, 'smarteverything');
  }
  if (platform === 'win32') {
    return environment.localAppData === null
      ? null
      : join(environment.localAppData, 'SmartEverything', 'agent');
  }
  if (platform === 'darwin') {
    return join(environment.home, 'Library', 'Application Support', 'SmartEverything', 'agent');
  }
  return null;
}
