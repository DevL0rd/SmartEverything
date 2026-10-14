import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { HarnessRuntimeEvent } from '../host/events';

type NativeToolResult = Extract<
  Extract<HarnessRuntimeEvent, { kind: 'session' }>['event'],
  { type: 'tool/result' }
>['data'];

export function nativeToolText(content: readonly ContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function nativeToolOutput(result: NativeToolResult): string {
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
