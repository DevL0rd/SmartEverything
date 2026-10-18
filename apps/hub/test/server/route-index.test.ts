import { API_ENDPOINTS, buildPath, matchPath } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { RouteIndex } from '../../src/server/route-index';

function indexOf(...routes: readonly (readonly [string, string, string])[]): RouteIndex<string> {
  const index = new RouteIndex<string>();
  for (const [method, path, value] of routes) {
    index.add(method, path, value);
  }
  return index;
}

describe('RouteIndex', () => {
  it('prefers a literal segment over a parameter at the same position', () => {
    const index = indexOf(['GET', '/a/:id', 'param'], ['GET', '/a/me', 'literal']);
    expect(index.find('GET', '/a/me')).toStrictEqual({ value: 'literal', params: {} });
    expect(index.find('GET', '/a/x')).toStrictEqual({ value: 'param', params: { id: 'x' } });
  });

  it('backtracks from a literal prefix that dead-ends into the parameter route', () => {
    const index = indexOf(['GET', '/a/me/x', 'literal'], ['GET', '/a/:id/y', 'param']);
    expect(index.find('GET', '/a/me/y')).toStrictEqual({ value: 'param', params: { id: 'me' } });
  });

  it('separates methods on one path and reports a wrong method', () => {
    const index = indexOf(['GET', '/a', 'read'], ['POST', '/a', 'write']);
    expect(index.find('POST', '/a')).toStrictEqual({ value: 'write', params: {} });
    expect(index.find('DELETE', '/a')).toBe('wrong_method');
    expect(index.find('GET', '/b')).toBeNull();
    expect(index.find('GET', '/a/b')).toBeNull();
  });

  it('keeps the parameter names of each route although routes share a parameter position', () => {
    const index = indexOf(['GET', '/a/:first', 'one'], ['POST', '/a/:second', 'two']);
    expect(index.find('GET', '/a/v')).toStrictEqual({
      value: 'one',
      params: { first: 'v' },
    });
    expect(index.find('POST', '/a/v')).toStrictEqual({
      value: 'two',
      params: { second: 'v' },
    });
  });

  it('decodes parameters and ignores doubled and trailing slashes', () => {
    const index = indexOf(['GET', '/a/:id', 'param']);
    expect(index.find('GET', '/a//b%20c/')).toStrictEqual({
      value: 'param',
      params: { id: 'b c' },
    });
  });

  it('resolves every API endpoint to its own definition', () => {
    const index = new RouteIndex<string>();
    for (const [name, endpoint] of Object.entries(API_ENDPOINTS)) {
      index.add(endpoint.method, endpoint.path, name);
    }
    for (const [name, endpoint] of Object.entries(API_ENDPOINTS)) {
      const names = endpoint.path
        .split('/')
        .filter((segment) => segment.startsWith(':'))
        .map((segment) => segment.slice(1));
      const params = Object.fromEntries(names.map((parameter) => [parameter, `v-${parameter}`]));
      expect(index.find(endpoint.method, buildPath(endpoint.path, params)), name).toStrictEqual({
        value: name,
        params,
      });
    }
  });
});

describe('the API route table', () => {
  it('declares each method and path once', () => {
    const seen = new Set<string>();
    for (const endpoint of Object.values(API_ENDPOINTS)) {
      const key = `${endpoint.method} ${endpoint.path.replaceAll(/:[A-Za-z]+/gu, ':')}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});

const ENDPOINTS = Object.values(API_ENDPOINTS);

function literalCount(path: string): number {
  return path.split('/').filter((segment) => segment !== '' && !segment.startsWith(':')).length;
}

const BY_SPECIFICITY = [...ENDPOINTS].sort(
  (left, right) => literalCount(right.path) - literalCount(left.path),
);

function reference(method: string, pathname: string): string | null {
  const matching = BY_SPECIFICITY.filter((route) => matchPath(route.path, pathname) !== null);
  return matching.find((route) => route.method === method)?.path ?? null;
}

function siblingLiterals(path: string, position: number): readonly string[] {
  const prefix = path.split('/').slice(0, position + 1);
  return ENDPOINTS.flatMap((other) => {
    const segments = other.path.split('/');
    const sameStart = prefix.every((segment, at) => at === position || segments[at] === segment);
    const literal = segments[position];
    return sameStart && literal !== undefined && !literal.startsWith(':') ? [literal] : [];
  });
}

describe('the route index against the specificity rule', () => {
  it('resolves a parameter that equals a sibling literal as the literal-first rule does', () => {
    const index = new RouteIndex<string>();
    for (const route of ENDPOINTS) {
      index.add(route.method, route.path, route.path);
    }
    for (const route of ENDPOINTS) {
      const segments = route.path.split('/');
      for (const [position, segment] of segments.entries()) {
        if (!segment.startsWith(':')) continue;
        for (const literal of siblingLiterals(route.path, position)) {
          const probe = segments.map((at, k) =>
            k === position ? literal : at.replace(/^:.*/u, 'v'),
          );
          const pathname = probe.join('/');
          const found = index.find(route.method, pathname);
          expect(found === null || found === 'wrong_method' ? null : found.value, pathname).toBe(
            reference(route.method, pathname),
          );
        }
      }
    }
  });
});
