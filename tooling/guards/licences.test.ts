import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AndroidLibraryUnlistedError,
  androidDependencies,
  androidLibraries,
  extraLicences,
} from '../licence-extras.ts';
import { noticeFile, noticeTextOf, noticesOf } from '../licence-notices.ts';
import { isPermitted, unusedOverrides } from '../licence-policy.ts';

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'licences-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const GRADLE = `dependencies {
  detekt "io.gitlab.arturbosch.detekt:detekt-cli:1.23.8"
  implementation "androidx.work:work-runtime-ktx:2.12.0"
  compileOnly "com.google.firebase:firebase-messaging:25.0.1"
  compileOnly project(":react-native-webrtc")
  testImplementation "junit:junit:4.13.2"
}`;

describe('the licence policy', () => {
  it('permits an expression when every AND part is allowed and one OR part is allowed', () => {
    const allowed = new Set(['MIT', 'ISC']);
    expect(isPermitted('MIT AND ISC', allowed)).toBe(true);
    expect(isPermitted('MIT AND GPL-3.0', allowed)).toBe(false);
    expect(isPermitted('(GPL-3.0 OR ISC)', allowed)).toBe(true);
    expect(isPermitted('(GPL-3.0 OR LGPL-3.0)', allowed)).toBe(false);
  });

  it('names an override that no installed package uses', () => {
    const policy = { allowedLicenses: ['MIT'], overrides: { used: 'MIT', gone: 'MIT' } };
    expect(unusedOverrides(policy, [{ name: 'used', version: '1.0.0', licence: 'MIT' }])).toEqual([
      'gone',
    ]);
  });
});

describe('the Android licences', () => {
  it('reads shipped libraries from the module build file and ignores test and tool ones', () => {
    expect(androidDependencies(GRADLE).map((one) => `${one.name}@${one.version}`)).toEqual([
      'androidx.work:work-runtime-ktx@2.12.0',
      'com.google.firebase:firebase-messaging@25.0.1',
    ]);
  });

  it('refuses a library whose licence the list does not know', () => {
    expect(() => androidLibraries('implementation "org.example:unknown:1.0"')).toThrow(
      AndroidLibraryUnlistedError,
    );
  });

  it('knows the licence of every library the Android module really depends on', () => {
    const names = extraLicences().map((one) => one.name);
    expect(names).toContain('androidx.health.connect:connect-client');
    expect(names).toContain('io.getstream:stream-video-webrtc-android');
    expect(names).toContain('electron');
    expect(extraLicences().every((one) => one.licence !== '')).toBe(true);
  });
});

describe('the notice texts', () => {
  it('joins the licence and notice files of a package and skips everything else', () => {
    const directory = join(scratch, 'one');
    mkdirSync(directory);
    writeFileSync(join(directory, 'LICENSE'), 'Permission is granted.\n');
    writeFileSync(join(directory, 'NOTICE.txt'), 'Made by someone.\n');
    writeFileSync(join(directory, 'README.md'), 'not a notice');
    expect(noticeTextOf(directory)).toBe(
      'LICENSE\n\nPermission is granted.\n\nNOTICE.txt\n\nMade by someone.',
    );
  });

  it('has no text for a package that ships no licence file', () => {
    const directory = join(scratch, 'two');
    mkdirSync(directory);
    writeFileSync(join(directory, 'index.js'), '');
    expect(noticeTextOf(directory)).toBeNull();
  });

  it('matches a package to its installed folder by name and version', () => {
    const directory = join(scratch, 'three');
    mkdirSync(directory);
    writeFileSync(join(directory, 'LICENCE'), 'Text three');
    const notices = noticesOf(
      [
        { name: 'three', version: '1.0.0', licence: 'MIT' },
        { name: 'three', version: '2.0.0', licence: 'MIT' },
      ],
      new Map([['three@1.0.0', directory]]),
    );
    expect(notices.map((one) => one.text)).toEqual(['LICENCE\n\nText three', null]);
  });

  it('writes one block per package and says plainly when no text is bundled', () => {
    const written = noticeFile([
      { name: 'a', version: '1.0.0', licence: 'MIT', text: 'Text of a' },
      { name: 'b', version: '2.0.0', licence: 'ISC', text: null },
    ]);
    expect(written).toContain('a 1.0.0\nLicence: MIT');
    expect(written).toContain('Text of a');
    expect(written).toContain('b 2.0.0\nLicence: ISC');
    expect(written).toContain(
      'No licence text is bundled for this component; it is licensed under ISC.',
    );
  });
});
