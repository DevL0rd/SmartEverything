import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '../../src');
const HELPER = 'network/guarded-socket.ts';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const files = sourceFiles(SOURCE).map((path) => ({
  path: relative(SOURCE, path),
  text: readFileSync(path, 'utf8'),
}));

const NETWORK_CLIENT = /from '(ws|ssh2)'/;

describe('network sockets in the hub', () => {
  it('ping only through the helper that checks the socket is open', () => {
    const raw = files
      .filter((file) => file.path !== HELPER && /[sS]ocket\.ping\(/.test(file.text))
      .map((file) => file.path);
    expect(raw).toEqual([]);
  });

  it('keep an error listener for the whole life of a WebSocket or SSH client', () => {
    const once = files
      .filter((file) => NETWORK_CLIENT.test(file.text) && file.text.includes(".once('error'"))
      .map((file) => file.path);
    expect(once).toEqual([]);
  });
});
