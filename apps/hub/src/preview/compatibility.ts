import type {
  AiHtmlPreviewPublication,
  AiPreviewCatalogue,
  AiPreviewPublication,
} from '@smarteverything/domain';
const LEGACY_PUBLICATION_MS = 30 * 60_000;
export function previewPublicationView<T extends AiPreviewPublication | AiHtmlPreviewPublication>(
  view: T,
  lifetime: 'persistent' | undefined,
): T {
  if (lifetime === 'persistent' || view.expires_at !== null) return view;
  return { ...view, expires_at: new Date(Date.now() + LEGACY_PUBLICATION_MS).toISOString() };
}
export function previewCatalogueView(
  view: AiPreviewCatalogue,
  lifetime: 'persistent' | undefined,
): AiPreviewCatalogue {
  return {
    ...view,
    publications: view.publications.map((value) => previewPublicationView(value, lifetime)),
    documents: view.documents.map((value) => previewPublicationView(value, lifetime)),
  };
}
