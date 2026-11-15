export function readable(raw: string): string {
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function rsvpLinks(raw: string): string[] {
  return [
    ...readable(raw).matchAll(/http:\/\/hub\.test\/rsvp\/[A-Za-z0-9_-]{43}\?answer=\w+/g),
  ].map((match) => match[0]);
}
