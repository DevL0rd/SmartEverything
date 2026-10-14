import type {
  ClaudeAnswer,
  ClaudeController,
  ClaudeControllerRegistration,
  ClaudeLink,
  ClaudePrompt,
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

export interface ClaudeControlPlane {
  readonly link: () => ClaudeLinkState;
  readonly linkProblem: () => string | null;
  readonly controller: () => ClaudeControllerState;
  readonly prompts: () => readonly ClaudePrompt[];
  readonly sessionLink: (sessionId: string) => SessionLinkFacts;
  readonly usage: () => ClaudeUsage;
  readonly answer: (
    promptId: string,
    body: ClaudeAnswer,
    requester: Requester,
  ) => Promise<ClaudePrompt>;
  readonly installLink: () => Promise<ClaudeLink>;
  readonly removeLink: () => Promise<ClaudeLink>;
  readonly registerController: () => Promise<ClaudeControllerRegistration>;
  readonly removeController: () => Promise<ClaudeController>;
  readonly onChange: (listener: () => void) => () => void;
}
