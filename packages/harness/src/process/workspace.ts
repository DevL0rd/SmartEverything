import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessRuntime, HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
export async function updateWorkspace(
  runtime: HarnessRuntime,
  host: HarnessRuntimeOptions['host'],
  id: string,
  choice: Extract<HarnessRuntimeRequest, { kind: 'workspace' }>['choice'],
): Promise<void> {
  if (host.target.kind === 'server')
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'Hub conversations cannot mutate or select a hub-local workspace.',
    );
  const path =
    choice.action === 'home'
      ? host.homeDirectory
      : choice.action === 'select'
        ? choice.path
        : join(choice.parent, choice.name);
  if (choice.action === 'create') await mkdir(path, { recursive: false });
  await runtime.get(id).directory(path);
  runtime.deviceWorkspace(id, path);
  await runtime.get(id).flush();
}
