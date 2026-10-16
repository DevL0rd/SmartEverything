import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessRuntime, HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
export async function updateWorkspace(
  runtime: HarnessRuntime,
  host: HarnessRuntimeOptions['host'],
  id: string,
  choice: Extract<HarnessRuntimeRequest, { kind: 'workspace' }>['choice'],
): Promise<void> {
  runtime.assertNativeAccess(id);
  const path =
    choice.action === 'home'
      ? host.homeDirectory
      : choice.action === 'select'
        ? choice.path
        : join(choice.parent, choice.name);
  if (choice.action === 'create') await mkdir(path, { recursive: false });
  await runtime.directory(id, path);
}
