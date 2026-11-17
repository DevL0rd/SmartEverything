const GIF_SIGNATURE = 'GIF8';
const PACKET = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/;
const DATE_NAMES: readonly string[] = [
  'exif:DateTimeOriginal',
  'photoshop:DateCreated',
  'xmp:CreateDate',
];
const XMP_DATE =
  /^(?<date>\d{4}-\d{2}-\d{2})T(?<time>\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?<zone>Z|[+-]\d{2}:\d{2})?$/;

export function isGif(data: Buffer): boolean {
  return data.toString('latin1', 0, GIF_SIGNATURE.length) === GIF_SIGNATURE;
}

function valueOf(packet: string, name: string): string | null {
  const escaped = name.replace(':', '\\:');
  const attribute = new RegExp(`${escaped}="([^"]+)"`).exec(packet);
  if (attribute?.[1] !== undefined) return attribute[1].trim();
  const element = new RegExp(`<${escaped}>([^<]+)</${escaped}>`).exec(packet);
  return element?.[1] === undefined ? null : element[1].trim();
}

function momentText(value: string): string | null {
  const groups = XMP_DATE.exec(value)?.groups;
  if (groups?.['date'] === undefined || groups['time'] === undefined) return null;
  const time = groups['time'].length === 5 ? `${groups['time']}:00` : groups['time'];
  return `${groups['date']} ${time}${groups['zone'] ?? ''}`;
}

export function gifXmpDate(data: Buffer): string | null {
  const packet = PACKET.exec(data.toString('utf8'))?.[0];
  if (packet === undefined) return null;
  for (const name of DATE_NAMES) {
    const value = valueOf(packet, name);
    const text = value === null ? null : momentText(value);
    if (text !== null) return text;
  }
  return null;
}
