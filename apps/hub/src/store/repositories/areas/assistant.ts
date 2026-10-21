import type { StoreContext } from '../../context';
import { AiAgentRunsRepository } from '../ai-agent-runs';
import { AiChatsRepository } from '../ai-chats';
import { AiEngineDefaultsRepository } from '../ai-engine-defaults';
import { AiModelsRepository } from '../../../openrouter/models-repository';
import { AiProjectsRepository } from '../ai-projects';
import { AiProviderRepository } from '../ai-provider';
import { AiRuntimeProviderRepository } from '../ai-runtime-provider';
import { AssistantChatRepository } from '../assistant-chat';
import { AssistantEventsRepository } from '../assistant-events';
import { AssistantMessageSearchRepository } from '../assistant-message-search';
import { ClaudeCliOperationsRepository } from '../claude-cli-operations';
import { DshSessionsRepository } from '../dsh-sessions';
import { HarnessChildrenRepository } from '../harness-children';
import { HarnessConfigurationRepository } from '../harness-configuration';
import { HarnessCoordinationRepository } from '../harness-coordination';
import { HarnessDeliveriesRepository } from '../harness-deliveries';
import { HarnessExtensionsRepository } from '../harness-extensions';
import { HarnessRecoveryRepository } from '../harness-recovery';
import { HarnessSkillUpdatesRepository } from '../harness-skill-updates';
import { ImageOperationsRepository } from '../image-operations';
import { NativeCommandOperationsRepository } from '../native-command-operations';

export const assistantRepositories = (context: StoreContext) =>
  ({
    assistantChat: new AssistantChatRepository(context),
    imageOperations: new ImageOperationsRepository(context),
    claudeCliOperations: new ClaudeCliOperationsRepository(context),
    nativeCommandOperations: new NativeCommandOperationsRepository(context),
    assistantSearch: new AssistantMessageSearchRepository(context),
    aiChats: new AiChatsRepository(context),
    aiProjects: new AiProjectsRepository(context),
    aiProvider: new AiProviderRepository(context),
    aiRuntimeProvider: new AiRuntimeProviderRepository(context),
    aiAgentRuns: new AiAgentRunsRepository(context),
    dshSessions: new DshSessionsRepository(context),
    harnessConfiguration: new HarnessConfigurationRepository(context),
    harnessExtensions: new HarnessExtensionsRepository(context),
    harnessSkillUpdates: new HarnessSkillUpdatesRepository(context),
    harnessCoordination: new HarnessCoordinationRepository(context),
    harnessChildren: new HarnessChildrenRepository(context),
    harnessRecovery: new HarnessRecoveryRepository(context),
    harnessDeliveries: new HarnessDeliveriesRepository(context),
    aiEngineDefaults: new AiEngineDefaultsRepository(context),
    assistantEvents: new AssistantEventsRepository(context),
    aiModels: new AiModelsRepository(context),
  }) as const;
