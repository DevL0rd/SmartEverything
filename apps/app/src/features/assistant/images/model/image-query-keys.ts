export const IMAGE_QUERY_PREFIX = ['window', 'image-operations'] as const;
export const imageOperationsKey = (chatId: string): readonly string[] => [
  ...IMAGE_QUERY_PREFIX,
  'chat',
  chatId,
];

export const imagePreviewKey = (operationId: string): readonly string[] => [
  ...IMAGE_QUERY_PREFIX,
  'preview',
  operationId,
];
