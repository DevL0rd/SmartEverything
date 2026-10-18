import * as Crypto from 'expo-crypto';
import { ownGatewayLease, closeGatewayLease, previewOwnerConnection } from './preview-owner';
import { Logger } from '@smarteverything/logging';
import {
  htmlPreviewBridge,
  nativeHtmlPreviewAvailable,
  projectHtmlTarget,
} from '../../../platform/browser-html-projection';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_PREVIEW_ENDPOINTS as E,
  type AiPreviewPublication,
  type AiPreviewLease,
  type AiPreviewCatalogue,
  type AiHtmlPreviewPublication,
  type HtmlPresentationLease,
  type NativePageDescriptor,
  type BrowserTarget,
  NATIVE_PAGE_DESCRIPTOR,
  BrowserPolicyError,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { PREVIEW_KEY } from '../../../queries/preview-notices';
import { useActiveProfile } from '../../../store/people';
const log = new Logger('app.html-preview');
export function usePreviews(
  chatId: string,
): ReturnType<typeof useScreenQuery<Awaited<ReturnType<typeof read>>>> {
  const connection = useConnection();
  const profile = useActiveProfile();
  return useScreenQuery({
    queryKey: [...PREVIEW_KEY, profile?.id ?? 'none', chatId],
    enabled: connection.status === 'paired' && profile !== null,
    queryFn: () => read(chatId),
  });
}
function read(chatId: string): Promise<AiPreviewCatalogue> {
  return api().call(E.readAiChatPreviews, { params: { chatId }, query: previewLifetime() });
}
export async function createPreviewLease(
  chatId: string,
  publication: AiPreviewPublication,
): Promise<AiPreviewLease> {
  const connection = previewOwnerConnection();
  const lease = await api().call(E.createAiPreviewLease, {
    params: { chatId },
    body: { publication_id: publication.id, revision: publication.revision, ...previewLifetime() },
  });
  return ownGatewayLease(connection, chatId, lease);
}

export async function openChatPage(
  publication: AiHtmlPreviewPublication,
): Promise<{ readonly page: NativePageDescriptor; readonly target: BrowserTarget }> {
  const native = htmlPreviewBridge();
  const id = `${publication.id}:page:${publication.profile_id}:${Crypto.randomUUID()}`;
  if (native !== null) {
    if (!nativeHtmlPreviewAvailable())
      throw new BrowserPolicyError('Update the app and server to open saved chat pages.');
    const entry = publication.project_source?.entry;
    const page = NATIVE_PAGE_DESCRIPTOR.parse({
      version: 2,
      chatId: publication.chat_id,
      publicationId: publication.id,
      profileId: publication.profile_id,
      entryPath:
        entry === undefined ? '/' : `/${entry.split('/').map(encodeURIComponent).join('/')}`,
    });
    return { page, target: await projectHtmlTarget(page, id) };
  }
  const connection = previewOwnerConnection();
  const view = await api().call(E.readAiHtmlPage, {
    params: { chatId: publication.chat_id, publicationId: publication.id },
  });
  const response = await fetch(`${view.origin}/.se-preview/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${connection.token}` },
  });
  if (!response.ok) throw new BrowserPolicyError('Reconnect your browser to open this chat page.');
  return {
    page: view.page,
    target: {
      kind: 'preview',
      id,
      origin: view.origin,
      url: view.url,
      initialPath: view.page.entryPath,
      page: view.page,
      profileId: view.page.profileId,
    },
  };
}

export async function releasePreviewLease(
  chatId: string,
  lease: AiPreviewLease | HtmlPresentationLease,
): Promise<void> {
  if (lease.expires_at !== null) return;
  if (!('purpose' in lease)) {
    closeGatewayLease(lease);
    return;
  }
  try {
    await api().call(E.releaseAiPreviewLease, { params: { chatId }, body: { lease } });
  } catch (error: unknown) {
    log.error('lease.retirement_failed', error, { publicationId: lease.publication_id });
  }
}

function previewLifetime(): { readonly lifetime: 'persistent' } {
  return { lifetime: 'persistent' };
}
