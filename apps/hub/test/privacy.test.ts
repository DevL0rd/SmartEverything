import { describe, expect, it } from 'vitest';
import { PRIVACY_PATH, privacyPage } from '../src/extensions/privacy';
import { useBootedServer } from './support/booted';

const suite = useBootedServer({ linked: false });

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
    expect(page).toContain('<h2>Health Connect</h2>');
    expect(page).toContain('uploads them');
    expect(page).toContain('<h2>Deleting data</h2>');
    expect(page).not.toContain('<script');
  });
});
