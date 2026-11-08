export type ShareTarget =
  | { readonly kind: 'pick' }
  | { readonly kind: 'root'; readonly rootId: string }
  | { readonly kind: 'album'; readonly albumId: string };

export type ShareOpener = (target: ShareTarget) => void;
