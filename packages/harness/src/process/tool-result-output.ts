interface ToolBlock {
  readonly type: string;
  readonly text?: string | undefined;
}
interface ToolResultData {
  readonly message: { readonly content: readonly ToolBlock[] };
  readonly meta?: unknown;
  readonly error?: unknown;
}

export function nativeToolText(content: readonly ToolBlock[]): string {
  return content
    .flatMap((block) => (block.type === 'text' && block.text !== undefined ? [block.text] : []))
    .join('\n');
}

export function nativeToolOutput(result: ToolResultData): string {
  return JSON.stringify({
    content: result.message.content,
    ...(result.meta === undefined ? {} : { meta: result.meta }),
    ...(result.error === undefined ? {} : { error: result.error }),
  });
}

export function toolSummary(text: string | null, maximum: number): string | null {
  if (text === null || text.length <= maximum) return text;
  const suffix = '… [Summary limited; full tool result recorded]';
  return `${text.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
}
