export const WIDGET_SURFACE =
  'overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1';

export function surfaceClassName(framed: boolean): string {
  return framed ? `h-full ${WIDGET_SURFACE}` : WIDGET_SURFACE;
}
