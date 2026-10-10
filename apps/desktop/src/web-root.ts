import path from 'node:path';

const INDEX_DOCUMENT = 'index.html';

export type ResolvedWebPath =
  | { readonly kind: 'inside'; readonly filePath: string; readonly isRoute: boolean }
  | { readonly kind: 'refused'; readonly reason: string; readonly received: string };

export type WebResponsePlan =
  | { readonly kind: 'file'; readonly filePath: string }
  | { readonly kind: 'index'; readonly filePath: string }
  | { readonly kind: 'not-found'; readonly received: string }
  | { readonly kind: 'refused'; readonly reason: string; readonly received: string };

function decodePathname(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch (error: unknown) {
    if (error instanceof URIError) {
      return undefined;
    }
    throw error;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  const leaves = relative === '..' || relative.startsWith(`..${path.sep}`);
  return !leaves && !path.isAbsolute(relative);
}

function isRoutePath(decoded: string): boolean {
  return path.posix.extname(decoded) === '';
}

export function resolveWebPath(root: string, pathname: string): ResolvedWebPath {
  const decoded = decodePathname(pathname);
  if (decoded === undefined) {
    return {
      kind: 'refused',
      reason: 'the path is not valid percent-encoding',
      received: pathname,
    };
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return { kind: 'refused', reason: 'the path holds a NUL or backslash', received: pathname };
  }
  const absoluteRoot = path.resolve(root);
  const filePath = path.resolve(absoluteRoot, `.${path.posix.normalize(`/${decoded}`)}`);
  if (!isInside(absoluteRoot, filePath)) {
    return { kind: 'refused', reason: 'the path leaves the web export', received: pathname };
  }
  return { kind: 'inside', filePath, isRoute: isRoutePath(decoded) };
}

export function planWebResponse(
  root: string,
  resolved: ResolvedWebPath,
  isFile: boolean,
): WebResponsePlan {
  if (resolved.kind === 'refused') {
    return resolved;
  }
  if (isFile) {
    return { kind: 'file', filePath: resolved.filePath };
  }
  if (resolved.isRoute) {
    return { kind: 'index', filePath: path.join(path.resolve(root), INDEX_DOCUMENT) };
  }
  return { kind: 'not-found', received: resolved.filePath };
}
