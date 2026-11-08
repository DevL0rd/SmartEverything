export type NodeEditStage<Detail> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'read-only' }
  | { readonly kind: 'editing'; readonly detail: Detail };

export function nodeEditStage<Detail extends { readonly editable: boolean }>(
  detail: Detail | undefined,
): NodeEditStage<Detail> {
  if (detail === undefined) return { kind: 'loading' };
  return detail.editable ? { kind: 'editing', detail } : { kind: 'read-only' };
}
