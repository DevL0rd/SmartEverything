import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planWebResponse, resolveWebPath, type ResolvedWebPath } from '../src/web-root.js';

const ROOT = path.resolve('/srv/web-export');

function inside(resolved: ResolvedWebPath): { filePath: string; isRoute: boolean } {
  if (resolved.kind !== 'inside') {
    throw new Error(`expected the path to resolve inside the root, received ${resolved.reason}`);
  }
  return resolved;
}

describe('resolveWebPath', () => {
  it('resolveWebPath maps an asset path to the file under the root', () => {
    expect(resolveWebPath(ROOT, '/_expo/static/js/web/entry.js')).toEqual({
      kind: 'inside',
      filePath: path.join(ROOT, '_expo', 'static', 'js', 'web', 'entry.js'),
      isRoute: false,
    });
  });

  it('resolveWebPath marks extensionless paths as routes', () => {
    expect(inside(resolveWebPath(ROOT, '/devices/kitchen')).isRoute).toBe(true);
    expect(inside(resolveWebPath(ROOT, '/')).isRoute).toBe(true);
    expect(inside(resolveWebPath(ROOT, '/rooms/')).isRoute).toBe(true);
  });

  it('resolveWebPath decodes percent-encoding before resolving', () => {
    expect(inside(resolveWebPath(ROOT, '/assets/my%20icon.png')).filePath).toBe(
      path.join(ROOT, 'assets', 'my icon.png'),
    );
  });

  it('resolveWebPath keeps encoded dot segments inside the root', () => {
    expect(inside(resolveWebPath(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).filePath).toBe(
      path.join(ROOT, 'etc', 'passwd'),
    );
    expect(inside(resolveWebPath(ROOT, '/a/%2E%2E%2F..%2F..%2F1.txt')).filePath).toBe(
      path.join(ROOT, '1.txt'),
    );
  });

  it('resolveWebPath refuses encoded backslashes and NUL bytes', () => {
    expect(resolveWebPath(ROOT, '/..%5C..%5C1.ini')).toEqual({
      kind: 'refused',
      reason: 'the path holds a NUL or backslash',
      received: '/..%5C..%5C1.ini',
    });
    expect(resolveWebPath(ROOT, '/index.html%00.png')).toEqual({
      kind: 'refused',
      reason: 'the path holds a NUL or backslash',
      received: '/index.html%00.png',
    });
  });

  it('resolveWebPath refuses malformed percent-encoding', () => {
    expect(resolveWebPath(ROOT, '/%E0%A4%A')).toEqual({
      kind: 'refused',
      reason: 'the path is not valid percent-encoding',
      received: '/%E0%A4%A',
    });
  });

  it('resolveWebPath never resolves outside the root for any pathname', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('..', '.', '%2e%2e', '%2E.', 'a', 'b.js', '', '%2f', '//'), {
          maxLength: 12,
        }),
        (segments) => {
          const resolved = resolveWebPath(ROOT, `/${segments.join('/')}`);
          if (resolved.kind === 'inside') {
            const relative = path.relative(ROOT, resolved.filePath);
            expect(relative.startsWith('..')).toBe(false);
            expect(path.isAbsolute(relative)).toBe(false);
          }
        },
      ),
    );
  });
});

describe('planWebResponse', () => {
  it('planWebResponse serves a file that exists', () => {
    const resolved = resolveWebPath(ROOT, '/favicon.ico');
    expect(planWebResponse(ROOT, resolved, true)).toEqual({
      kind: 'file',
      filePath: path.join(ROOT, 'favicon.ico'),
    });
  });

  it('planWebResponse answers an unknown route with index.html', () => {
    const resolved = resolveWebPath(ROOT, '/settings/profile');
    expect(planWebResponse(ROOT, resolved, false)).toEqual({
      kind: 'index',
      filePath: path.join(ROOT, 'index.html'),
    });
  });

  it('planWebResponse answers the root with index.html when it is a directory', () => {
    expect(planWebResponse(ROOT, resolveWebPath(ROOT, '/'), false)).toEqual({
      kind: 'index',
      filePath: path.join(ROOT, 'index.html'),
    });
  });

  it('planWebResponse refuses to answer a missing asset with index.html', () => {
    const resolved = resolveWebPath(ROOT, '/_expo/static/js/missing.js');
    expect(planWebResponse(ROOT, resolved, false)).toEqual({
      kind: 'not-found',
      received: path.join(ROOT, '_expo', 'static', 'js', 'missing.js'),
    });
  });

  it('planWebResponse passes a refusal through unchanged', () => {
    const resolved = resolveWebPath(ROOT, '/%5c');
    expect(planWebResponse(ROOT, resolved, false)).toEqual(resolved);
  });
});
