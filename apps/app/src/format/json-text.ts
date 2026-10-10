export type JsonText =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

export function jsonText(text: string): JsonText {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
