export function subtitleProp(subtitle: string | undefined): { readonly subtitle?: string } {
  return subtitle === undefined ? {} : { subtitle };
}
