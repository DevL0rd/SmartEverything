import { ownGatewayLease, closeGatewayLease, previewOwnerConnection } from './preview-owner';
import { Logger } from '@smarteverything/logging';
import {
  nativeHtmlPreviewAvailable,
  nativeProjectPreviewAvailable,
  nativeHtmlPersistenceAvailable,
} from '../../../platform/browser-html-projection';
import { useQuery } from '@tanstack/react-query';
import {
  AI_PREVIEW_ENDPOINTS as E,
  type AiPreviewPublication,
  type AiPreviewLease,
  type AiPreviewCatalogue,
  type AiHtmlPreviewPublication,
  type HtmlPresentationLease,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import {
  useServerAiPreviews,
  serverSupportsPreviewLifetime,
} from '../../../api/connection/server-capabilities';
import { PREVIEW_KEY } from '../../../queries/preview-notices';
import { useActiveProfile } from '../../../store/people';
const log = new Logger('app.html-preview');
export function usePreviews(
  chatId: string,
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof read>>>> {
  const connection = useConnection();
  const profile = useActiveProfile();
  const supported = useServerAiPreviews(
    connection.status === 'paired' ? connection.connection.url : null,
  );
  return useQuery({
    queryKey: [...PREVIEW_KEY, profile?.id ?? 'none', chatId],
    enabled: supported && profile !== null,
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

export async function createHtmlPreviewLease(
  chatId: string,
  publication: AiHtmlPreviewPublication,
): Promise<HtmlPresentationLease> {
  if (
    nativeHtmlPreviewAvailable() &&
    (publication.project_source?.standalone !== false || nativeProjectPreviewAvailable())
  )
    return api().call(E.createAiNativeHtmlPreviewLease, {
      params: { chatId },
      body: {
        ...previewLifetime(nativeHtmlPersistenceAvailable()),
        purpose: 'native-html',
        publication_id: publication.id,
        revision: publication.revision,
      },
    });
  const connection = previewOwnerConnection();
  const lease = await api().call(E.createAiHtmlPreviewLease, {
    params: { chatId },
    body: { publication_id: publication.id, revision: publication.revision, ...previewLifetime() },
  });
  return ownGatewayLease(connection, chatId, lease);
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

function previewLifetime(presenter = true): { readonly lifetime?: 'persistent' } {
  const connection = previewOwnerConnection();
  return presenter && serverSupportsPreviewLifetime(connection.url)
    ? { lifetime: 'persistent' }
    : {};
}
