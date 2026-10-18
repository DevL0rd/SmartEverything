import type { StoreContext } from '../../context';
import { AppSessionsRepository } from '../app-sessions';
import { ComputerAiRepository } from '../computer-ai';
import { ComputerNativeMcpPolicyRepository } from '../computer-native-mcp-policy';
import { ComputerNodesRepository } from '../computer-nodes';
import { ComputerRuntimesRepository } from '../computer-runtimes';
import { ComputerScopesRepository } from '../computer-scopes';

export const computerRepositories = (context: StoreContext) =>
  ({
    computerScopes: new ComputerScopesRepository(context),
    computerAi: new ComputerAiRepository(context),
    computerNativeMcpPolicy: new ComputerNativeMcpPolicyRepository(context),
    computerRuntimes: new ComputerRuntimesRepository(context),
    computerNodes: new ComputerNodesRepository(context),
    appSessions: new AppSessionsRepository(context),
  }) as const;
