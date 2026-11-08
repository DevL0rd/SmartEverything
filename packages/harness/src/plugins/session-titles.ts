import type { Context } from '@deepseek-ai/cordis';
import SessionTitle from '@deepseek-ai/dsh-session-title';
import * as FirstPromptTitle from '@deepseek-ai/dsh-session-title-first-prompt-llm';
import { AI_CHAT_TITLE_MAX } from '@smarteverything/domain';

export const name = 'session-titles';

const TITLE_WORDS = 6;
const UTF8_BYTES_PER_CHARACTER = 4;
const TITLE_BYTES = AI_CHAT_TITLE_MAX * UTF8_BYTES_PER_CHARACTER;

export const SESSION_TITLE_POLICY = {
  title: {
    fallbackMaxWords: TITLE_WORDS,
    fallbackMaxBytes: TITLE_BYTES,
    maxTitleBytes: TITLE_BYTES,
  },
  generation: {
    targetWords: TITLE_WORDS,
    targetCjkCharacters: TITLE_WORDS * 2,
    maxInputBytes: Number.MAX_SAFE_INTEGER,
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
  },
} as const;

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(SessionTitle, SESSION_TITLE_POLICY.title);
  await ctx.plugin(FirstPromptTitle, SESSION_TITLE_POLICY.generation);
}
