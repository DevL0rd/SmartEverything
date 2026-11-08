import type { StoreContext } from '../../context';
import { AiAgentRunsRepository } from '../ai-agent-runs';
import { AiChatsRepository } from '../ai-chats';
import { AiEngineDefaultsRepository } from '../ai-engine-defaults';
import { AiMemoriesRepository } from '../ai-memories';
import { AiModelsRepository } from '../../../openrouter/models-repository';
import { AiProjectsRepository } from '../ai-projects';
import { AiProviderRepository } from '../ai-provider';
import { AiRuntimeProviderRepository } from '../ai-runtime-provider';
import { AiWeeklySubscriptionHistory } from '../ai-weekly-subscription-history';
import { AssistantReactionRepository } from '../assistant-reactions';
import { AssistantChatRepository } from '../assistant-chat';
import { AssistantEventsRepository } from '../assistant-events';
import { AssistantMessageSearchRepository } from '../assistant-message-search';
import { ClaudeCliOperationsRepository } from '../claude-cli-operations';
import { DshSessionsRepository } from '../dsh-sessions';
import { HarnessConfigurationRepository } from '../harness-configuration';
import { HarnessSessionsRepository } from '../harness-sessions';
import { HarnessDeliveriesRepository } from '../harness-deliveries';
import { HarnessExtensionsRepository } from '../harness-extensions';
import { HarnessRecoveryRepository } from '../harness-recovery';
import { HarnessSkillUpdatesRepository } from '../harness-skill-updates';
import { ImageOperationsRepository } from '../image-operations';
import { NativeCommandOperationsRepository } from '../native-command-operations';
import { HubUpdateNotesRepository } from '../hub-update-notes';

const repositoriesWithChat = (context: StoreContext, assistantChat: AssistantChatRepository) =>
  ({
    assistantChat,
    assistantReactions: new AssistantReactionRepository(context, assistantChat),
    imageOperations: new ImageOperationsRepository(context),
    claudeCliOperations: new ClaudeCliOperationsRepository(context),
    nativeCommandOperations: new NativeCommandOperationsRepository(context),
    hubUpdateNotes: new HubUpdateNotesRepository(context),
    assistantSearch: new AssistantMessageSearchRepository(context),
    aiChats: new AiChatsRepository(context),
    aiProjects: new AiProjectsRepository(context),
    aiMemories: new AiMemoriesRepository(context),
    aiProvider: new AiProviderRepository(context),
    aiRuntimeProvider: new AiRuntimeProviderRepository(context),
    aiWeeklySubscriptionHistory: new AiWeeklySubscriptionHistory(context),
    aiAgentRuns: new AiAgentRunsRepository(context),
    dshSessions: new DshSessionsRepository(context),
    harnessConfiguration: new HarnessConfigurationRepository(context),
    harnessExtensions: new HarnessExtensionsRepository(context),
    harnessSkillUpdates: new HarnessSkillUpdatesRepository(context),
    harnessSessions: new HarnessSessionsRepository(context),
    harnessRecovery: new HarnessRecoveryRepository(context),
    harnessDeliveries: new HarnessDeliveriesRepository(context),
    aiEngineDefaults: new AiEngineDefaultsRepository(context),
    assistantEvents: new AssistantEventsRepository(context),
    aiModels: new AiModelsRepository(context),
  }) as const;

export function assistantRepositories(
  context: StoreContext,
): ReturnType<typeof repositoriesWithChat> {
  return repositoriesWithChat(context, new AssistantChatRepository(context));
}
