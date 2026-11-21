import type { SyncScope } from './placement-scope';

function under(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function toDrivePath(scope: SyncScope, wirePath: string): string {
  return scope.base === null ? wirePath : `${scope.base.relPath}/${wirePath}`;
}

export function inScope(scope: SyncScope, drivePath: string): boolean {
  if (scope.base !== null && !drivePath.startsWith(`${scope.base.relPath}/`)) return false;
  return !scope.excluded.some((wire) => under(drivePath, toDrivePath(scope, wire)));
}

export function toWirePath(scope: SyncScope, drivePath: string): string | null {
  if (!inScope(scope, drivePath)) return null;
  return scope.base === null ? drivePath : drivePath.slice(scope.base.relPath.length + 1);
}
