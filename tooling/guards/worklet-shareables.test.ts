import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const SINGLETON =
  /^const (\w+) = new (?!Map\b|Set\b|WeakMap\b|WeakSet\b|Date\b|RegExp\b|Error\b|Promise\b|ArrayBuffer\b)[A-Z]\w*[<(]/gm;

const sources = filesUnder(applicationSource).filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
);

function workletBodies(source: string): readonly string[] {
  const bodies: string[] = [];
  let at = source.indexOf("'worklet';");
  while (at !== -1) {
    const open = source.lastIndexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(source.slice(open, end));
    at = source.indexOf("'worklet';", end);
  }
  return bodies;
}

function offenders(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  const names = [...source.matchAll(SINGLETON)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
  if (names.length === 0) return [];
  return workletBodies(source).flatMap((body) =>
    names.filter((name) => new RegExp(`\\b${name}\\b`).test(body)),
  );
}

describe('worklet captures', () => {
  it('no worklet references a module-level class instance; instances do not survive serialization to the UI runtime (live-view board crash, 2026-11-05)', () => {
    const bad = sources.flatMap((file) => {
      const names = offenders(file);
      return names.length === 0 ? [] : [`${insideApp(file)}: ${names.join(', ')}`];
    });
    expect(bad).toEqual([]);
  });
});
