const SEPARATOR = '\u0000';

export function componentOf(scope: string, source: string): string {
  const area = scope.slice(scope.indexOf('.') + 1);
  return area === '' ? source : `${area}${SEPARATOR}${source}`;
}

export function componentArea(component: string): string {
  const at = component.indexOf(SEPARATOR);
  return at === -1 ? component : component.slice(0, at);
}
