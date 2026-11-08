import { describe, expect, it } from 'vitest';
import { LiveRenewal } from '../../src/assistant-voice/live-renewal';
import { ModelReplies } from '../../src/assistant-voice/model-replies';
import { ReplyWatchdog } from '../../src/assistant-voice/reply-watchdog';
import { ConversationTrace } from '../../src/assistant-voice/conversation-trace';

describe('model replies after a tool result', () => {
  it('owes a new reply once the result is handed back, so later speech counts as unanswered', () => {
    const trace = new ConversationTrace(() => 'call');
    const replies = new ModelReplies(
      new ReplyWatchdog(),
      new LiveRenewal(() => null),
      trace,
      () => 0,
    );
    replies.output();
    expect(replies.answering).toBe(true);
    replies.owed();
    expect(replies.answering).toBe(false);
    replies.output();
    expect(replies.answering).toBe(true);
  });
});
