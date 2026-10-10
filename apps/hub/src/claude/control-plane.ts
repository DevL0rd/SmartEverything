import type {
  ClaudeAnswer,
  ClaudeControl,
  ClaudeController,
  ClaudeControllerRegistration,
  ClaudeDelivery,
  ClaudeLink,
  ClaudePrompt,
  ClaudeSession,
  ClaudeStart,
  ClaudeStarted,
  ClaudeStatus,
  ClaudeUsage,
} from '@smarteverything/domain';
import type { Requester } from './prompt-broker';

export type ClaudeLinkState = ClaudeStatus['link']['state'];

export type ClaudeControllerState = ClaudeStatus['controller']['state'];

export interface SessionLinkFacts {
  readonly connected: boolean;
  readonly reported: boolean;
}

export interface SessionOps {
  readonly socketOf: (id: string) => string | null;
  readonly whenRunning: (id: string, milliseconds: number) => Promise<boolean>;
  readonly userMessages: (id: string) => number;
  readonly whenUserMessage: (id: string, after: number, milliseconds: number) => Promise<boolean>;
}

export interface ControlTarget {
  readonly session: ClaudeSession;
  readonly socket: string | null;
  readonly ops: SessionOps;
}

export interface ClaudeControlPlane {
  readonly link: () => ClaudeLinkState;
  readonly linkProblem: () => string | null;
  readonly controller: () => ClaudeControllerState;
  readonly prompts: () => readonly ClaudePrompt[];
  readonly sessionLink: (sessionId: string) => SessionLinkFacts;
  readonly usage: () => ClaudeUsage;
  readonly control: (target: ControlTarget, body: ClaudeControl) => Promise<ClaudeDelivery | null>;
  readonly answer: (
    promptId: string,
    body: ClaudeAnswer,
    requester: Requester,
  ) => Promise<ClaudePrompt>;
  readonly start: (body: ClaudeStart) => Promise<ClaudeStarted>;
  readonly installLink: () => Promise<ClaudeLink>;
  readonly removeLink: () => Promise<ClaudeLink>;
  readonly registerController: () => Promise<ClaudeControllerRegistration>;
  readonly removeController: () => Promise<ClaudeController>;
  readonly onChange: (listener: () => void) => () => void;
}
