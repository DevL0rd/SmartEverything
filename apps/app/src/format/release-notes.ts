export interface ReleaseNotesView {
  readonly brief: string;
  readonly full: string;
}

export function releaseNotesOf(notes: string | undefined): ReleaseNotesView | null {
  if (notes === undefined) return null;
  const brief = notes
    .trim()
    .split(/\r\n|\r|\n/u, 1)[0]
    ?.trim();
  return brief === undefined || brief === '' ? null : { brief, full: notes };
}
