import { embeddedBrowserRoutes } from './embedded-browser';
import { previewDiagnosticRoutes } from './preview-diagnostics';
import { AI_PREVIEW_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound } from '../router';
export const aiPreviewRoutes = (preview: PreviewService) =>
  ({
    ...previewDiagnosticRoutes(preview),
    ...embeddedBrowserRoutes(preview),
    ...htmlPublicationRoutes(preview),
    ...chatPageAddressRoutes(preview),
    createAiHtmlPreviewLease: bound(E.createAiHtmlPreviewLease, ({ caller, params, body }) => {
      const publication = preview.documents.visible(caller, params.chatId, body.publication_id);
      if (publication.view.revision !== body.revision)
        throw new ApiError('conflict', 'The HTML changed; choose its current revision.');
      return preview.leases.issueHtml(caller, publication, preview.gateway.domain());
    }),
    createAiNativeHtmlPreviewLease: bound(
      E.createAiNativeHtmlPreviewLease,
      ({ caller, params, body }) => {
        const publication = preview.documents.visible(caller, params.chatId, body.publication_id);
        if (publication.view.revision !== body.revision)
          throw new ApiError('conflict', 'The HTML changed; choose its current revision.');
        return preview.leases.issueNativeHtml(caller, publication);
      },
    ),
    createAiPreviewLease: bound(E.createAiPreviewLease, ({ caller, params, body }) => {
      const publication = preview.publications.visible(caller, params.chatId, body.publication_id);
      if (publication.view.revision !== body.revision)
        throw new ApiError(
          'conflict',
          'This published service was replaced; choose its current revision.',
        );
      return preview.leases.issue(caller, publication, preview.gateway.domain());
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
  }) as const;

const htmlPublicationRoutes = (preview: PreviewService) =>
  ({
    publishAiHtmlPreview: bound(E.publishAiHtmlPreview, ({ caller, params, body }) =>
      preview.documents.publish(caller, params.chatId, body),
    ),
    publishAiProjectPreview: bound(E.publishAiProjectPreview, ({ caller, params, body }) =>
      preview.documents.publishProject(caller, params.chatId, body),
    ),
    readAiChatPreviews: bound(E.readAiChatPreviews, ({ caller, params }) => ({
      ...preview.publications.catalogue(caller, params.chatId, preview.gateway.status()),
      documents: [...preview.documents.catalogue(caller, params.chatId)],
    })),
  }) as const;

const chatPageAddressRoutes = (preview: PreviewService) =>
  ({
    readAiHtmlPage: bound(E.readAiHtmlPage, ({ caller, params }) => {
      const publication = preview.documents.visible(caller, params.chatId, params.publicationId);
      const entry = publication.view.project_source?.entry;
      const entryPath =
        entry === undefined ? '/' : `/${entry.split('/').map(encodeURIComponent).join('/')}`;
      const origin = `https://${publication.view.id.replaceAll('-', '')}.${preview.gateway.domain()}`;
      return {
        page: {
          version: 2 as const,
          chatId: params.chatId,
          publicationId: publication.view.id,
          profileId: publication.view.profile_id,
          entryPath,
        },
        origin,
        url: `${origin}${entryPath}`,
      };
    }),
  }) as const;
