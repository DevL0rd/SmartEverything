import type { Policy } from './policy';

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class Triggers {
  constructor(private readonly policy: Policy) {}

  accepts(actorId: string, content: string, botId: string): boolean {
    this.policy.assertUser(actorId);
    if (new RegExp(`<@!?${botId}>`).test(content)) {
      return true;
    }
    return this.policy.config.match_names && this.named(content);
  }

  named(content: string): boolean {
    return this.policy
      .names()
      .some((name) =>
        new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(name)}(?![\\p{L}\\p{N}_])`, 'iu').test(content),
      );
  }
}
