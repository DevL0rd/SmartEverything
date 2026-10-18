export interface NotedAttachment {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width: number | null;
  readonly height: number | null;
}

type NoteKind = 'image' | 'audio' | 'video';

export function noteKindOf(mime: string): NoteKind | null {
  const [type] = mime.split('/');
  return type === 'image' || type === 'audio' || type === 'video' ? type : null;
}

function sizeOf(file: NotedAttachment): string {
  return file.width === null || file.height === null
    ? ''
    : `, ${String(file.width)}×${String(file.height)}`;
}

export function attachmentNote(
  file: NotedAttachment,
  text: string | null,
  options: { readonly pending?: boolean } = {},
): string {
  const kind = noteKindOf(file.mime);
  if (kind === null) return `[Attached ${file.name} (${file.mime}${sizeOf(file)})]`;
  const lead = `[${kind} ${JSON.stringify(file.name)}, ${file.mime}${sizeOf(file)}, ${String(file.bytes)} bytes · id ${file.id}]`;
  const label = kind === 'image' ? 'Description' : 'Transcript';
  const body =
    text !== null ? ` ${label}: ${text}` : options.pending === true ? ` ${label} pending.` : '';
  return `${lead}${body} Use read_chats view attachment with id ${file.id} to look at the original again if you need detail.`;
}

export interface MediaPlan {
  readonly native: boolean;
  readonly describe: boolean;
}

export function mediaPlan(
  mime: string,
  inputModalities: readonly string[] | null,
  describeImages: boolean,
): MediaPlan {
  const kind = noteKindOf(mime);
  if (kind === null) return { native: false, describe: false };
  const native = inputModalities?.includes(kind) === true;
  return { native, describe: !native || (kind === 'image' && describeImages) };
}
