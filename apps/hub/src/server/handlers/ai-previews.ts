import { embeddedBrowserRoutes } from './embedded-browser';
import { previewPublicationView, previewCatalogueView } from '../../preview/compatibility';
import { previewDiagnosticRoutes } from './preview-diagnostics';
import { AI_PREVIEW_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound, type Bound } from '../router';
export function aiPreviewRoutes(preview: PreviewService): Record<keyof typeof E, Bound> {
  return {
    ...previewDiagnosticRoutes(preview),
    ...embeddedBrowserRoutes(preview),
    ...htmlPublicationRoutes(preview),
    createAiHtmlPreviewLease: bound(E.createAiHtmlPreviewLease, ({ caller, params, body }) => {
      const publication = preview.documents.visible(caller, params.chatId, body.publication_id);
      if (publication.view.revision !== body.revision)
        throw new ApiError('conflict', 'The HTML changed; choose its current revision.');
      return preview.leases.issueHtml(caller, publication, preview.gateway.domain(), body.lifetime);
    }),
    createAiNativeHtmlPreviewLease: bound(
      E.createAiNativeHtmlPreviewLease,
      ({ caller, params, body }) => {
        const publication = preview.documents.visible(caller, params.chatId, body.publication_id);
        if (publication.view.revision !== body.revision)
          throw new ApiError('conflict', 'The HTML changed; choose its current revision.');
        return preview.leases.issueNativeHtml(caller, publication, body.lifetime);
      },
    ),
    createAiPreviewLease: bound(E.createAiPreviewLease, ({ caller, params, body }) => {
      const publication = preview.publications.visible(caller, params.chatId, body.publication_id);
      if (publication.view.revision !== body.revision)
        throw new ApiError(
          'conflict',
          'This published service was replaced; choose its current revision.',
        );
      return preview.leases.issue(caller, publication, preview.gateway.domain(), body.lifetime);
    }),
    releaseAiPreviewLease: bound(E.releaseAiPreviewLease, ({ caller, params, body }) => {
      preview.leases.release(caller, params.chatId, body.lease);
      return { ok: true as const };
    }),
    revokeAiPreview: bound(E.revokeAiPreview, ({ caller, params }) => {
      if (preview.documents.find(params.publicationId) !== undefined) {
        const document = preview.documents.visible(caller, params.chatId, params.publicationId);
        preview.documents.revoke(document.view.id);
        return { ok: true as const };
      }
      const publication = preview.publications.visible(caller, params.chatId, params.publicationId);
      preview.publications.revoke(publication.view.id);
      return { ok: true as const };
    }),
  };
}

function htmlPublicationRoutes(
  preview: PreviewService,
): Pick<
  Record<keyof typeof E, Bound>,
  'publishAiHtmlPreview' | 'publishAiProjectPreview' | 'readAiChatPreviews'
> {
  return {
    publishAiHtmlPreview: bound(E.publishAiHtmlPreview, async ({ caller, params, body, query }) =>
      previewPublicationView(
        await preview.documents.publish(caller, params.chatId, body),
        query.lifetime,
      ),
    ),
    publishAiProjectPreview: bound(
      E.publishAiProjectPreview,
      async ({ caller, params, body, query }) =>
        previewPublicationView(
          await preview.documents.publishProject(caller, params.chatId, body),
          query.lifetime,
        ),
    ),
    readAiChatPreviews: bound(E.readAiChatPreviews, ({ caller, params, query }) =>
      previewCatalogueView(
        {
          ...preview.publications.catalogue(caller, params.chatId, preview.gateway.status()),
          documents: [...preview.documents.catalogue(caller, params.chatId)],
        },
        query.lifetime,
      ),
    ),
  };
}
