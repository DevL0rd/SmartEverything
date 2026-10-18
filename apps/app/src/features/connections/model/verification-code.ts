export const CODE_DIGITS = 6;

export function codeComplete(code: string): boolean {
  return code.length === CODE_DIGITS;
}
