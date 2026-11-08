export interface ChatMemoryRow {
  readonly value: boolean;
  readonly disabled: boolean;
  readonly subtitle: string;
}

export function chatMemoryRow(chatMemory: boolean, personMemory: boolean | null): ChatMemoryRow {
  if (personMemory === null)
    return { value: chatMemory, disabled: true, subtitle: 'Checking your memory setting' };
  if (!personMemory)
    return {
      value: false,
      disabled: true,
      subtitle: 'Memory is off for you in AI settings, so no chat remembers',
    };
  return {
    value: chatMemory,
    disabled: false,
    subtitle: chatMemory
      ? 'This chat recalls and keeps memories'
      : 'This chat neither recalls nor keeps memories',
  };
}
