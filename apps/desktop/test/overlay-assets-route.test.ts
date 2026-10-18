import { describe, expect, it } from 'vitest';
import { OVERLAY_PAGE_URL, planOverlayAsset } from '../src/overlay/overlay-assets-route.js';

const ROOT = '/app/dist/src/overlay';

describe('overlay asset route', () => {
  it('serves the page through a custom scheme instead of file URLs', () => {
    expect(OVERLAY_PAGE_URL.startsWith('file:')).toBe(false);
    expect(planOverlayAsset(ROOT, OVERLAY_PAGE_URL)).toEqual({
      kind: 'file',
      filePath: `${ROOT}/overlay.html`,
      contentType: 'text/html; charset=utf-8',
    });
  });

  it.each([
    ['overlay-page.js', 'text/javascript; charset=utf-8'],
    ['overlay.css', 'text/css; charset=utf-8'],
    ['fonts/Geist-Regular.ttf', 'font/ttf'],
  ])('types %s', (file, contentType) => {
    const plan = planOverlayAsset(ROOT, `smarteverything-overlay://page/${file}`);
    expect(plan).toEqual({ kind: 'file', filePath: `${ROOT}/${file}`, contentType });
  });

  it('never leaves the assets directory and refuses unknown types or hosts', () => {
    expect(planOverlayAsset(ROOT, 'smarteverything-overlay://page/%2e%2e/%2e%2e/main.js')).toEqual({
      kind: 'file',
      filePath: `${ROOT}/main.js`,
      contentType: 'text/javascript; charset=utf-8',
    });
    expect(
      planOverlayAsset(ROOT, 'smarteverything-overlay://page/overlay-preload.cjs'),
    ).toMatchObject({ kind: 'refused', status: 404 });
    expect(planOverlayAsset(ROOT, 'smarteverything-overlay://other/overlay.html')).toMatchObject({
      kind: 'refused',
      status: 404,
    });
  });
});
