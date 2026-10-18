import { readFile } from 'node:fs/promises';
import { protocol } from 'electron';
import { Logger } from '@smarteverything/logging';
import { OVERLAY_SCHEME, planOverlayAsset } from './overlay-assets-route.js';

const log = new Logger('desktop.overlay');

export function serveOverlayAssets(root: string): void {
  protocol.handle(OVERLAY_SCHEME, async (request) => {
    const plan = planOverlayAsset(root, request.url);
    if (plan.kind === 'refused') {
      log.warn('overlay.asset_refused', { status: plan.status, reason: plan.reason });
      return new Response(plan.reason, { status: plan.status });
    }
    try {
      const body = await readFile(plan.filePath);
      return new Response(body, { headers: { 'content-type': plan.contentType } });
    } catch (cause) {
      log.error('overlay.asset_failed', cause, { file: plan.filePath });
      return new Response('missing overlay asset', { status: 404 });
    }
  });
}
