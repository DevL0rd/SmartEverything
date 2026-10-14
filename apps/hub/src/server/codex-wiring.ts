import type { ComputerRuntimeHost } from '../computers/runtime-host';
import { createCodexHost, type CodexHostOptions } from '../codex/host';
export type CodexLocalFactoryOptions = Omit<CodexHostOptions, 'deviceId' | 'settings'>;
export function codexLocalFactory(
  options: CodexLocalFactoryOptions,
): (deviceId: string) => ComputerRuntimeHost {
  return (deviceId) => createCodexHost({ ...options, deviceId });
}
