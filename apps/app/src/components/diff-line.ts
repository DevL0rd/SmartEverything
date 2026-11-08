export interface FileDiffLine {
  readonly kind: 'context' | 'add' | 'remove';
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export const DIFF_LINE_CHARACTERS = 8192;
