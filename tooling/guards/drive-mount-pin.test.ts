import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const HERE = join(import.meta.dirname, '..', 'drive-mount');
const PIN = z.strictObject({
  go: z.string().regex(/^\d+\.\d+\.\d+$/),
  fuse: z.strictObject({
    module: z.literal('github.com/hanwen/go-fuse/v2'),
    version: z.string().regex(/^v\d+\.\d+\.\d+$/),
    licence: z.literal('BSD-3-Clause'),
  }),
});
const GO2RTC_PIN = z.object({ go: z.string() });

function read(file: string): string {
  return readFileSync(join(HERE, file), 'utf8');
}

const pin = PIN.parse(JSON.parse(read('pin.json')));
const required = `${pin.fuse.module} ${pin.fuse.version}`;

describe('drive mount pin', () => {
  it('builds with the Go version the go2rtc build pins', () => {
    const go2rtc = GO2RTC_PIN.parse(JSON.parse(read('../go2rtc/pin.json')));
    expect(pin.go).toBe(go2rtc.go);
  });

  it('declares the pinned Go version in the module file', () => {
    expect(read('go.mod')).toContain(`\ngo ${pin.go}\n`);
  });

  it('requires go-fuse at the pinned version', () => {
    expect(read('go.mod')).toContain(required);
  });

  it('holds both hashes of the pinned go-fuse in go.sum', () => {
    const sums = read('go.sum');
    expect(sums).toContain(`${required} h1:`);
    expect(sums).toContain(`${required}/go.mod h1:`);
  });

  it('vendors the BSD-3-Clause text of go-fuse', () => {
    const licence = read('LICENSE');
    expect(licence.startsWith('New BSD License')).toBe(true);
    expect(licence).toContain('Redistribution and use in source and binary forms');
    expect(licence).toContain('Neither the name of Ivan Krasin nor the names of its');
  });

  it('keeps the helper free of cgo-only libraries on Linux', () => {
    const linuxSources = ['fs.go', 'cache_linux.go', 'mounts_linux.go', 'notify_linux.go']
      .map(read)
      .join('\n');
    expect(linuxSources).not.toContain('import "C"');
    expect(linuxSources).not.toContain('winfsp/cgofuse');
  });
});
