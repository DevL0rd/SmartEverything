import type { ClaudeCapabilities } from '@smarteverything/domain';

const LEGACY_READ_ONLY =
  'Legacy sessions are read-only. Open an owned CLI chat for native session control.';
export interface CapabilityFacts {
  readonly running: boolean;
  readonly connected: boolean;
  readonly reported: boolean;
}
export function capabilitiesOf(facts: CapabilityFacts): ClaudeCapabilities {
  const connected = facts.running && facts.connected;
  return {
    send: LEGACY_READ_ONLY,
    interrupt: LEGACY_READ_ONLY,
    set_mode: LEGACY_READ_ONLY,
    set_model: LEGACY_READ_ONLY,
    answer_prompts:
      connected || (facts.running && facts.reported)
        ? null
        : 'This CLI session is not attached to the native link.',
    usage: connected ? null : 'This CLI session is not attached to the native link.',
  };
}
