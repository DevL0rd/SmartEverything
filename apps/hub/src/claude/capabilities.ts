import type { ClaudeCapabilities } from '@smarteverything/domain';
import type { ClaudeControllerState, ClaudeLinkState } from './control-plane';

const LINK_REASON: Readonly<Record<ClaudeLinkState, string | null>> = {
  not_installed: 'The SmartEverything link is not installed in Claude Desktop',
  needs_repair: 'The SmartEverything link needs repair',
  installed: null,
};

const CONTROLLER_REASON: Readonly<Record<ClaudeControllerState, string | null>> = {
  not_registered: 'The controller session is not registered',
  lost: 'The controller session was closed; send any message in it to wake it',
  busy: null,
  ready: null,
};

const NOT_CONNECTED = 'This session has not connected to the SmartEverything link';

const NOT_LISTED = 'Claude Desktop does not list this session';

const NOT_RESUMABLE =
  'The session is not running and has no conversation id Claude Desktop can resume';

const NOT_REPORTED = 'This session has not reported to the SmartEverything link yet';

export interface CapabilityFacts {
  readonly running: boolean;
  readonly link: ClaudeLinkState;
  readonly controller: ClaudeControllerState;
  readonly connected: boolean;
  readonly reported: boolean;
  readonly listed: boolean;
  readonly socket: boolean;
  readonly resumable: boolean;
}

function steerReason(facts: CapabilityFacts, controller: string | null): string | null {
  if (facts.connected || (controller === null && facts.listed)) {
    return null;
  }
  return `${LINK_REASON[facts.link] ?? NOT_CONNECTED}; ${controller ?? NOT_LISTED}`;
}

function sendReason(facts: CapabilityFacts, controller: string | null): string | null {
  if (!facts.running) {
    return facts.resumable ? null : NOT_RESUMABLE;
  }
  return facts.socket ? null : steerReason(facts, controller);
}

const STOPPED_REASON = 'The session is not running';

const STOPPED: ClaudeCapabilities = {
  send: STOPPED_REASON,
  interrupt: STOPPED_REASON,
  answer_prompts: STOPPED_REASON,
  set_mode: STOPPED_REASON,
  set_model: STOPPED_REASON,
  usage: STOPPED_REASON,
};

function answerReason(facts: CapabilityFacts): string | null {
  const link = LINK_REASON[facts.link];
  if (link !== null) {
    return link;
  }
  return facts.reported || facts.connected ? null : NOT_REPORTED;
}

export function capabilitiesOf(facts: CapabilityFacts): ClaudeCapabilities {
  if (!facts.running) {
    return { ...STOPPED, send: sendReason(facts, null) };
  }
  const controller = CONTROLLER_REASON[facts.controller];
  const direct = controller ?? (facts.listed ? null : NOT_LISTED);
  return {
    send: sendReason(facts, controller),
    interrupt: steerReason(facts, controller),
    answer_prompts: answerReason(facts),
    set_mode: direct,
    set_model: direct,
    usage: facts.connected ? null : (LINK_REASON[facts.link] ?? NOT_CONNECTED),
  };
}
