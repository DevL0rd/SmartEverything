declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'hub-note': { kind: 'hub-note' };
  }
}

export const HUB_NOTE_SOURCE = { kind: 'hub-note' } as const;

export function hubNoteText(text: string): string {
  return `Note from SmartEverything, not written by the person: ${text}`;
}
