export function chatSelectionParams(
  chatId: string,
  message?: string,
): {
  readonly chatId: string;
  readonly message: string | undefined;
  readonly section: undefined;
  readonly work: undefined;
  readonly operation: undefined;
  readonly browserAction: undefined;
} {
  return {
    chatId,
    message,
    section: undefined,
    work: undefined,
    operation: undefined,
    browserAction: undefined,
  };
}
