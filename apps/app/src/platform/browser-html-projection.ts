import {
  serverSupportsNativeHtml,
  serverSupportsNativeProject,
} from '../api/connection/server-capabilities';
import type { NativeHtmlLease, BrowserTarget, NativeHtmlPreview } from '@smarteverything/domain';
import { desktopBridge } from '../design/platform';
import { androidHtmlPreview } from '../../modules/health-connect/src/html-preview';
import { routeFor, assertHubLease } from '../api/connection/active-route';
import { connectionState } from '../api/connection/connection';

export function htmlPreviewBridge(): NativeHtmlPreview | null {
  const bridge = desktopBridge();
  const html = bridge === null ? androidHtmlPreview : bridge.htmlPreview;
  return html?.supported() === true ? html : null;
}
export function nativeHtmlPreviewAvailable(): boolean {
  const connection = connectionState.get();
  return (
    connection.status === 'paired' &&
    serverSupportsNativeHtml(connection.connection.url) &&
    htmlPreviewBridge() !== null
  );
}
export function nativeProjectPreviewAvailable(): boolean {
  const connection = connectionState.get();
  return (
    nativeHtmlPreviewAvailable() &&
    connection.status === 'paired' &&
    serverSupportsNativeProject(connection.connection.url) &&
    (htmlPreviewBridge()?.projectVersion?.() ?? 0) >= 1
  );
}
export async function projectHtmlTarget(
  chatId: string,
  lease: NativeHtmlLease,
  id: string,
): Promise<BrowserTarget> {
  const bridge = htmlPreviewBridge();
  if (bridge === null)
    throw new Error('This native HTML lease requires its registered native presenter.');
  const connection = connectionState.get();
  if (connection.status !== 'paired')
    throw new Error('HTML projection requires the active paired server.');
  const route = routeFor(connection.connection).lease();
  if (
    route.nativeAuthority !== true ||
    route.binding === undefined ||
    route.nativeRouteGeneration === undefined
  )
    throw new Error('HTML projection requires the independently bound native route.');
  assertHubLease(route, 'POST');
  const projection = await bridge.open({
    scopeId: route.scopeId,
    binding: route.binding,
    routeGeneration: route.nativeRouteGeneration,
    authorization: `Bearer ${connection.connection.token}`,
    claim: {
      chatId,
      lease,
      ...(nativeProjectPreviewAvailable() ? { capability: 'native-project-v1' as const } : {}),
    },
  });
  if (!route.isCurrent()) {
    await bridge.release(projection.id);
    assertHubLease(route, 'POST');
  }
  return {
    kind: 'native-html',
    id,
    projectionId: projection.id,
    url: projection.url,
    ...(projection.project === true ? { project: true as const } : {}),
  };
}
export async function releaseHtmlTarget(target: BrowserTarget): Promise<void> {
  if (target.kind !== 'native-html') return;
  await htmlPreviewBridge()?.release(target.projectionId);
}

export function nativeHtmlPersistenceAvailable(): boolean {
  return (htmlPreviewBridge()?.lifetimeVersion?.() ?? 1) >= 2;
}
