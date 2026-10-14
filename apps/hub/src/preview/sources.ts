import type { Publication, PreviewPublications } from './publications';
import type { HtmlPublication, PreviewDocuments } from './documents';
export type PreviewSource = Publication | HtmlPublication;
export function isHtmlPreview(source: PreviewSource): source is HtmlPublication {
  return 'readHtml' in source;
}
export function previewNeedsOwner(source: PreviewSource): boolean {
  return !isHtmlPreview(source) || source.view.file_source !== undefined;
}
export class PreviewSources {
  constructor(
    private readonly services: PreviewPublications,
    private readonly documents: PreviewDocuments,
  ) {}
  require(id: string): PreviewSource {
    return this.documents.find(id) === undefined
      ? this.services.require(id)
      : this.documents.require(id);
  }
  onRevoke(listener: (id: string) => void): () => void {
    const subscriptions = [this.services.onRevoke(listener), this.documents.onInvalidate(listener)];
    return (): void => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }
}
