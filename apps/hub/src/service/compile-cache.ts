import { constants, enableCompileCache, flushCompileCache } from 'node:module';

export class CompileCacheError extends Error {
  override readonly name = 'CompileCacheError';
}

export function enableServiceCompileCache(directory: string): void {
  const result = enableCompileCache(directory);
  if (result.status === constants.compileCacheStatus.FAILED)
    throw new CompileCacheError(
      `The module compile cache in ${directory} could not be enabled: ${result.message ?? 'Node gave no reason'}.`,
    );
}

export function saveServiceCompileCache(): void {
  flushCompileCache();
}
