import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { JobLog } from './job-log';

export async function contextPercent(query: Query, log: JobLog): Promise<number | null> {
  try {
    const usage = await query.getContextUsage({ detail: 'summary' });
    return Math.min(100, Math.max(0, usage.percentage));
  } catch (cause) {
    log.contextUnreadable(cause);
    return null;
  }
}
