import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  LINK_LIFETIME_SECONDS,
  LINK_WINDOW_SECONDS,
  linkExpiry,
  MediaLinks,
} from '../../src/server/media-links';
import { captureLogs } from '../support/logs';

const ITEM = '0e000000-0000-4000-8000-000000000001';
const START = Date.parse('2026-11-14T00:00:00.000Z');

function at(seconds: number): Date {
  return new Date(START + seconds * 1000);
}

function urlOf(link: { readonly url: string }): URL {
  return new URL(link.url, 'http://hub.local');
}

describe('link expiry windows', () => {
  captureLogs();

  it('gives every link signed within one window the same expiry', () => {
    const first = linkExpiry(at(0));
    expect(linkExpiry(at(1))).toBe(first);
    expect(linkExpiry(at(LINK_WINDOW_SECONDS - 1))).toBe(first);
    expect(linkExpiry(at(LINK_WINDOW_SECONDS))).toBe(first + LINK_WINDOW_SECONDS);
  });

  it('never lets a link live longer than the lifetime, nor shorter than one window', () => {
    for (let offset = 0; offset < 3 * LINK_WINDOW_SECONDS; offset += 7) {
      const life = linkExpiry(at(offset)) - (START / 1000 + offset);
      expect(life).toBeLessThanOrEqual(LINK_LIFETIME_SECONDS);
      expect(life).toBeGreaterThan(LINK_LIFETIME_SECONDS - LINK_WINDOW_SECONDS);
    }
  });

  it('signs the same thumbnail to the same URL within a window and a new one after it', () => {
    let now = at(10);
    const links = new MediaLinks(() => now);
    const first = links.driveThumb(ITEM, 'thumb', 2).url;
    now = at(LINK_WINDOW_SECONDS - 1);
    expect(links.driveThumb(ITEM, 'thumb', 2).url).toBe(first);
    expect(links.driveThumb(ITEM, 'thumb', 3).url).not.toBe(first);
    now = at(LINK_WINDOW_SECONDS);
    const next = links.driveThumb(ITEM, 'thumb', 2).url;
    expect(next).not.toBe(first);
    expect(links.verifyDrive(urlOf({ url: first })).rev).toBe(2);
    expect(links.verifyDrive(urlOf({ url: next })).rev).toBe(2);
  });

  it('refuses a windowed link once it expires', () => {
    let now = at(LINK_WINDOW_SECONDS - 1);
    const links = new MediaLinks(() => now);
    const url = urlOf(links.driveThumb(ITEM, 'thumb', 2));
    now = new Date(Number(url.searchParams.get('expires')) * 1000);
    expect(() => links.verifyDrive(url)).toThrow(ApiError);
  });

  it('keeps the signature bound to the path and expiry', () => {
    const links = new MediaLinks(() => at(0));
    const url = urlOf(links.driveThumb(ITEM, 'thumb', 2));
    url.searchParams.set('expires', String(Number(url.searchParams.get('expires')) + 1));
    expect(() => links.verifyDrive(url)).toThrow(ApiError);
  });
});
