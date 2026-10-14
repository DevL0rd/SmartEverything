import type {
  AiPreviewCatalogue,
  AiPreviewLease,
  AiPreviewPublication,
  AiHtmlPreviewPublication,
  AiHtmlPreviewLease,
  NativeHtmlLease,
  HtmlPresentationLease,
  BrowserTarget,
} from '@smarteverything/domain';
class PreviewAuthorizationError extends Error {
  constructor(readonly publicationId: string) {
    super('The service returned an invalid preview authorization. Select the service again.');
    this.name = 'PreviewAuthorizationError';
  }
}
export type BrowserPublication = AiPreviewPublication | AiHtmlPreviewPublication;
export function isHtmlPublication(
  publication: BrowserPublication,
): publication is AiHtmlPreviewPublication {
  return 'kind' in publication;
}
export type BrowserSelection =
  | {
      readonly kind: 'html';
      readonly target: BrowserTarget;
      readonly publication: AiHtmlPreviewPublication;
      readonly lease: HtmlPresentationLease;
      readonly notice: number;
    }
  | { readonly kind: 'public'; readonly target: BrowserTarget }
  | {
      readonly kind: 'preview';
      readonly target: BrowserTarget;
      readonly publication: AiPreviewPublication;
      readonly lease: AiPreviewLease;
      readonly notice: number;
    };
export function previewSelection(
  publication: AiPreviewPublication,
  lease: AiPreviewLease,
  notice: number,
  applicationOrigins: readonly string[],
): BrowserSelection {
  const url = new URL(lease.url);
  const origin = new URL(lease.origin);
  const fieldsMatch = [
    lease.publication_id === publication.id,
    lease.revision === publication.revision,
    lease.profile_id === publication.profile_id,
    lease.generation === publication.generation,
    lease.target.device_id === publication.target.device_id,
    origin.protocol === 'https:',
    origin.origin === lease.origin,
    url.origin === lease.origin,
    url.username === '',
    url.password === '',
    !applicationOrigins.some((value) => new URL(value).origin === lease.origin),
  ];
  if (!fieldsMatch.every(Boolean)) throw new PreviewAuthorizationError(publication.id);
  return {
    kind: 'preview',
    publication,
    lease,
    notice,
    target: {
      kind: 'preview',
      id: `${publication.id}:${publication.revision}:${lease.origin}`,
      url: lease.url,
      origin: lease.origin,
      initialPath: publication.initial_path,
    },
  };
}
export function selectionProblem(
  selection: BrowserSelection | null,
  catalogue: AiPreviewCatalogue | undefined,
  notices: ReadonlyMap<string, number>,
  _live?: boolean,
): string | null {
  if (selection === null || selection.kind === 'public') return null;
  if (selection.kind === 'html') return htmlSelectionProblem(selection, catalogue, notices);
  if ((notices.get(selection.publication.id) ?? 0) !== selection.notice)
    return 'Sharing changed or was revoked. Choose a currently shared service to continue.';
  if (previewExpired(selection.lease))
    return 'Preview access expired. Choose the service again to renew it.';
  return publicationProblem(selection, catalogue);
}
function publicationProblem(
  selection: Extract<BrowserSelection, { kind: 'preview' }>,
  catalogue: AiPreviewCatalogue | undefined,
): string | null {
  if (catalogue === undefined) return null;
  if (!catalogue.gateway.ready)
    return 'Preview connection unavailable. Choose the service again when its connection is ready.';
  const publication = catalogue.publications.find((row) => row.id === selection.publication.id);
  if (publication === undefined) return 'This service is no longer shared with this chat.';
  const matches = [
    publication.revision === selection.publication.revision,
    publication.generation === selection.publication.generation,
    publication.runtime_instance === selection.publication.runtime_instance,
  ];
  return matches.every(Boolean)
    ? null
    : 'This service restarted or was replaced. Choose it again to open a new preview.';
}

export function htmlSelection(
  publication: AiHtmlPreviewPublication,
  lease: AiHtmlPreviewLease,
  notice: number,
  applicationOrigins: readonly string[],
): BrowserSelection {
  const url = new URL(lease.url);
  const origin = new URL(lease.origin);
  if (
    lease.publication_id !== publication.id ||
    lease.revision !== publication.revision ||
    lease.profile_id !== publication.profile_id ||
    origin.protocol !== 'https:' ||
    origin.origin !== lease.origin ||
    url.origin !== lease.origin ||
    url.username !== '' ||
    url.password !== '' ||
    applicationOrigins.some((value) => new URL(value).origin === lease.origin)
  )
    throw new PreviewAuthorizationError(publication.id);
  return {
    kind: 'html',
    publication,
    lease,
    notice,
    target: {
      kind: 'preview',
      id: `${publication.id}:${publication.revision}:${lease.origin}`,
      url: lease.url,
      origin: lease.origin,
      initialPath: '/',
    },
  };
}
function htmlSelectionProblem(
  selection: Extract<BrowserSelection, { kind: 'html' }>,
  catalogue: AiPreviewCatalogue | undefined,
  notices: ReadonlyMap<string, number>,
): string | null {
  if (previewExpired(selection.lease)) return 'Preview access expired. Select the HTML again.';
  if (catalogue === undefined) return null;
  if (selection.target.kind !== 'native-html' && !catalogue.gateway.ready)
    return 'The preview connection is unavailable.';
  const current = catalogue.documents.find((document) => document.id === selection.publication.id);
  if (current === undefined) return 'This HTML is no longer shared with this chat.';
  if (
    current.revision !== selection.publication.revision ||
    (notices.get(current.id) ?? 0) !== selection.notice
  )
    return 'The HTML changed. Loading its current revision.';
  return null;
}

export function nativeHtmlSelection(
  publication: AiHtmlPreviewPublication,
  lease: NativeHtmlLease,
  notice: number,
  target: BrowserTarget,
): BrowserSelection {
  if (
    target.kind !== 'native-html' ||
    lease.publication_id !== publication.id ||
    lease.revision !== publication.revision ||
    lease.profile_id !== publication.profile_id ||
    previewExpired(lease)
  )
    throw new PreviewAuthorizationError(publication.id);
  return { kind: 'html', publication, lease, notice, target };
}

function previewExpired(lease: HtmlPresentationLease | AiPreviewLease): boolean {
  return lease.expires_at !== null && Date.parse(lease.expires_at) <= Date.now();
}
