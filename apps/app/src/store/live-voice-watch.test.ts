import type { LiveClientMessageInput } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LiveVoiceWatch } from './live-voice-watch';

interface Rig {
  readonly sent: LiveClientMessageInput[];
  readonly watch: LiveVoiceWatch;
  readonly attach: () => void;
}

function rig(): Rig {
  const sent: LiveClientMessageInput[] = [];
  const watch = new LiveVoiceWatch();
  return {
    sent,
    watch,
    attach: (): void => {
      watch.attach((message) => {
        sent.push(message);
      });
    },
  };
}

describe('live voice levels watch', () => {
  it('sends nothing until a socket exists and then the wanted call once', () => {
    const { sent, watch, attach } = rig();
    watch.watch('call-1');
    expect(sent).toEqual([]);
    attach();
    expect(sent).toEqual([{ type: 'voice_levels_watch', call_id: 'call-1' }]);
  });

  it('sends only when the wanted call changes', () => {
    const { sent, watch, attach } = rig();
    attach();
    watch.watch('call-1');
    watch.watch('call-1');
    watch.watch('call-2');
    watch.watch(null);
    watch.watch(null);
    expect(
      sent.map((message) => (message.type === 'voice_levels_watch' ? message.call_id : '?')),
    ).toEqual(['call-1', 'call-2', null]);
  });

  it('asks again on a new socket because the hub forgets a closed one', () => {
    const { sent, watch, attach } = rig();
    attach();
    watch.watch('call-1');
    watch.detach();
    watch.watch('call-2');
    expect(sent).toHaveLength(1);
    attach();
    expect(sent.at(-1)).toEqual({ type: 'voice_levels_watch', call_id: 'call-2' });
  });

  it('does not announce an empty wish on a fresh socket', () => {
    const { sent, attach } = rig();
    attach();
    expect(sent).toEqual([]);
  });

  it('asks again for the wanted call whenever the hub announces it, because the hub may have refused the first ask', () => {
    const { sent, watch, attach } = rig();
    attach();
    watch.watch('call-1');
    watch.refresh('call-1');
    watch.refresh('call-1');
    expect(sent).toEqual([
      { type: 'voice_levels_watch', call_id: 'call-1' },
      { type: 'voice_levels_watch', call_id: 'call-1' },
      { type: 'voice_levels_watch', call_id: 'call-1' },
    ]);
  });

  it('ignores an announcement of a call it does not want or before a socket exists', () => {
    const { sent, watch, attach } = rig();
    watch.watch('call-1');
    watch.refresh('call-1');
    attach();
    sent.length = 0;
    watch.refresh('call-2');
    watch.watch(null);
    sent.length = 0;
    watch.refresh('call-1');
    expect(sent).toEqual([]);
  });
});
