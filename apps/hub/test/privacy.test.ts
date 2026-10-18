import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_PATH, privacyPage } from '../src/extensions/privacy';
import {
  HEALTH_CONNECT_PERMISSION_PREFIX,
  PRIVACY_PERMISSION_TOPICS,
  PRIVACY_SECTIONS,
} from '../src/extensions/privacy/sections';
import { useBootedServer } from './support/booted';

const suite = useBootedServer({ linked: false });

const MANIFEST = join(
  import.meta.dirname,
  '..',
  '..',
  'app',
  'modules',
  'health-connect',
  'android',
  'src',
  'main',
  'AndroidManifest.xml',
);

function declaredPermissions(): readonly string[] {
  return [
    ...readFileSync(MANIFEST, 'utf8').matchAll(/<uses-permission[^>]*?android:name="([^"]+)"/gu),
  ]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .filter((name) => !name.startsWith(HEALTH_CONNECT_PERMISSION_PREFIX));
}

describe('the privacy page', () => {
  it('is served to anyone, without a token, as a page that runs no script', async () => {
    const response = await fetch(`${suite.current.base}${PRIVACY_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(await response.text()).toBe(privacyPage());
  });

  it('says what Health Connect data is read and where it goes', () => {
    const page = privacyPage();
    expect(page).toContain('<h2>Health Connect and activity</h2>');
    expect(page).toContain('uploads them');
    expect(page).toContain('<h2>Deleting data</h2>');
    expect(page).not.toContain('<script');
  });

  it('explains every permission the app declares under a section that is on the page', () => {
    const titles = new Set(PRIVACY_SECTIONS.map((section) => section.title));
    const unexplained = declaredPermissions().filter((name) => {
      const topic = PRIVACY_PERMISSION_TOPICS[name];
      return topic === undefined || !titles.has(topic);
    });
    expect(unexplained).toEqual([]);
  });

  it('names the outside services that receive data and how to delete it', () => {
    const page = privacyPage();
    for (const named of ['Gemini', 'Claude', 'Firebase Cloud Messaging', 'Xiaomi', 'Tuya']) {
      expect(page).toContain(named);
    }
    expect(page).toContain('90 days');
  });
});
