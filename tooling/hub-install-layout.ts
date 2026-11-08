import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const HUB_INSTALL_DIRECTORY = '.local/opt/SmartEverything-Hub';
export const HUB_SERVICE_DIRECTORY = 'resources/service';
export const HUB_SERVICE_ENTRY = 'service.mjs';
export const HUB_NODE_EXECUTABLE = 'node/bin/node';

const DESKTOP_PAYLOAD = [
  'app.asar',
  'resources/app.asar',
  'electron',
  'ear-process.mjs',
  'smarteverything',
  'smarteverything-node.service',
] as const;

export function defaultHubInstall(): string {
  return join(homedir(), HUB_INSTALL_DIRECTORY);
}

export function desktopPayloadIn(directory: string): string | undefined {
  return DESKTOP_PAYLOAD.find((file) => existsSync(join(directory, file)));
}

export function standaloneInstallProblem(directory: string): string | undefined {
  const desktop = desktopPayloadIn(directory);
  if (desktop !== undefined) return `${directory} contains desktop content (${desktop}).`;
  const node = join(directory, HUB_NODE_EXECUTABLE);
  if (!existsSync(node) || !statSync(node).isFile())
    return `${node} is missing from the standalone hub installation.`;
  return undefined;
}
