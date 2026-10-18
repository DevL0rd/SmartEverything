import type {
  AiPreviewCatalogue,
  AiPreviewLease,
  AiPreviewPublication,
  AiHtmlPreviewPublication,
  BrowserTarget,
  NativePageDescriptor,
} from '@smarteverything/domain';
class PreviewAuthorizationError extends Error {
  constructor(readonly publicationId: string) {
    super("Couldn't open this preview. Choose it again.");
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
      readonly page: NativePageDescriptor;
    }
  | { readonly kind: 'public'; readonly target: BrowserTarget }
  | {
      readonly kind: 'preview';
      readonly target: BrowserTarget;
      readonly publication: AiPreviewPublication;
      readonly lease: AiPreviewLease;
    };
export function previewSelection(
  publication: AiPreviewPublication,
  lease: AiPreviewLease,
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
    target: {
      kind: 'preview',
      id: `${publication.id}:${publication.revision}:${lease.origin}`,
      url: lease.url,
      origin: lease.origin,
      initialPath: publication.initial_path,
    },
  };
}
export type SelectionState =
  | { readonly kind: 'current' }
  | { readonly kind: 'gone'; readonly problem: string }
  | { readonly kind: 'stale'; readonly publication: AiPreviewPublication };

const CURRENT: SelectionState = { kind: 'current' };

export function selectionState(
  selection: BrowserSelection | null,
  catalogue: AiPreviewCatalogue | undefined,
): SelectionState {
  if (selection === null || selection.kind === 'public' || catalogue === undefined) return CURRENT;
  if (selection.kind === 'html')
    return catalogue.documents.some((document) => document.id === selection.publication.id)
      ? CURRENT
      : { kind: 'gone', problem: 'This page is no longer available in this chat.' };
  return previewState(selection, catalogue);
}
function previewState(
  selection: Extract<BrowserSelection, { kind: 'preview' }>,
  catalogue: AiPreviewCatalogue,
): SelectionState {
  const publication = catalogue.publications.find((row) => row.id === selection.publication.id);
  if (publication === undefined)
    return { kind: 'gone', problem: 'This service is no longer shared with this chat.' };
  const replaced =
    publication.revision !== selection.publication.revision ||
    publication.generation !== selection.publication.generation ||
    publication.runtime_instance !== selection.publication.runtime_instance;
  return replaced && catalogue.gateway.ready ? { kind: 'stale', publication } : CURRENT;
}

export function chatPageSelection(
  publication: AiHtmlPreviewPublication,
  page: NativePageDescriptor,
  target: BrowserTarget,
): BrowserSelection {
  if (
    page.chatId !== publication.chat_id ||
    page.profileId !== publication.profile_id ||
    page.publicationId !== publication.id
  )
    throw new PreviewAuthorizationError(publication.id);
  return { kind: 'html', publication, page, target };
}
