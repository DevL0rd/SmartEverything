import { AI_PROJECT_PATH, ApiError } from '@smarteverything/domain';
export function managedProjectPath(path: string): string {
  if (path.startsWith('/') || path.includes('\\') || path.includes('%'))
    throw new ApiError('forbidden', 'Use a relative managed workspace path.');
  if (path === '.') return 'workspace';
  return AI_PROJECT_PATH.parse(
    /^(workspace|temporary|transfers)(\/|$)/u.test(path) ? path : `workspace/${path}`,
  );
}
