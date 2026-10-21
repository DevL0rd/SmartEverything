import {
  BrowserPolicyError,
  type BrowserTarget,
  type ChatPage,
  type NativeHtmlPreview,
} from '@smarteverything/domain';
import { desktopBridge } from '../design/platform';
import { androidHtmlPreview } from '../../modules/health-connect/src/html-preview';
import { routeFor, assertHubLease } from '../api/connection/active-route';
import { connectionState } from '../api/connection/connection';

function htmlPreviewBridge(): NativeHtmlPreview | null {
  const bridge = desktopBridge();
  const html = bridge === null ? androidHtmlPreview : bridge.htmlPreview;
  return html?.supported() === true ? html : null;
}
export async function projectPageTarget(page: ChatPage, id: string): Promise<BrowserTarget> {
  const bridge = htmlPreviewBridge();
  if (bridge === null) throw new BrowserPolicyError('Update the app to open chat pages.');
  const connection = connectionState.get();
  if (connection.status !== 'paired')
    throw new BrowserPolicyError('Reconnect to open this chat page.');
  const route = routeFor(connection.connection).lease();
  if (route.nativeAuthority !== true || route.binding === undefined)
    throw new BrowserPolicyError('Reconnect this app to its paired server.');
  assertHubLease(route, 'GET');
  const projection = await bridge.open({
    scopeId: route.scopeId,
    binding: route.binding,
    authorization: `Bearer ${connection.connection.token}`,
    page,
  });
  return { kind: 'project', id, projectionId: projection.id, url: projection.url, page };
}
export async function releaseProjectTarget(target: BrowserTarget): Promise<void> {
  if (target.kind !== 'project') return;
  await htmlPreviewBridge()?.release(target.projectionId);
}
