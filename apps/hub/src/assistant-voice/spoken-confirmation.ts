import type { HubToolResult, ToolCaller } from '../ai-tools/hub-tool';
import type { ToolHub } from '../ai-tools/tool-hub';

const CONFIRMATION_WINDOW_MS = 60_000;
const AFFIRMATIVE = /\b(?:yes|yeah|yep|sure|ok(?:ay)?|do it|go ahead|confirm(?:ed)?|please do)\b/i;

interface Pending {
  readonly key: string;
  readonly at: number;
}

export class SpokenConfirmation {
  private pending: Pending | null = null;

  constructor(private readonly hub: ToolHub) {}

  async run(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
    heardSince: (at: number) => string,
  ): Promise<HubToolResult> {
    const key = `${name} ${JSON.stringify(args)}`;
    const now = Date.now();
    const pending = this.pending;
    const waiting = pending?.key === key && now - pending.at < CONFIRMATION_WINDOW_MS;
    if (waiting && !AFFIRMATIVE.test(heardSince(pending.at))) {
      return {
        response: {
          error: 'They have not said yes yet. Ask them out loud and wait for their answer.',
        },
        line: '',
        pictures: [],
      };
    }
    const result = await this.hub.call(name, args, { ...caller, confirmed: waiting });
    this.pending = 'needs_confirmation' in result.response ? { key, at: now } : null;
    return result;
  }
}
