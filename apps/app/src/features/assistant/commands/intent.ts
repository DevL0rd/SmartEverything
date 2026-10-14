export type CommandIntent =
  | { readonly kind: 'text' }
  | { readonly kind: 'discovery'; readonly prefix: string }
  | { readonly kind: 'command'; readonly name: string; readonly prefix: string };
export function commandIntent(text: string): CommandIntent {
  if (text === '/') return { kind: 'discovery', prefix: '' };
  const token = /^\/([^\s/]+)(?=\s|$)/u.exec(text)?.[1];
  if (token === undefined) return { kind: 'text' };
  return { kind: 'command', name: token, prefix: token };
}
export function insertCommand(text: string, name: string): string {
  return text.replace(/^\/(?:[^\s/]+)?/u, `/${name}`);
}
