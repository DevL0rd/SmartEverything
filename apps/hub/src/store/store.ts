import { SpeechRepository } from './repositories/speech';
import { DeviceEffectsRepository } from './repositories/device-effects';
import { DeviceGroupsRepository } from './repositories/device-groups';
import { AutomationSequencesRepository } from './repositories/automation-sequences';
import { AutomationValuesRepository } from './repositories/automation-values';
import { AutomationRunsRepository } from './repositories/automation-runs';
import { PreviewErrorRulesRepository } from './repositories/preview-error-rules';
import { HarnessSkillUpdatesRepository } from './repositories/harness-skill-updates';
import { PreviewProjectsRepository } from './repositories/preview-projects';
import { AiProjectsRepository } from './repositories/ai-projects';
import { NativeCommandOperationsRepository } from './repositories/native-command-operations';
import { ClaudeCliOperationsRepository } from './repositories/claude-cli-operations';
import { BleObservationsRepository } from './repositories/ble-observations';
import { HarnessConfigurationRepository } from './repositories/harness-configuration';
import { HarnessSkillPresentationsRepository } from './repositories/harness-skill-presentations';
import { HarnessChildrenRepository } from './repositories/harness-children';
import { ImageOperationsRepository } from './repositories/image-operations';
import { HarnessRecoveryRepository } from './repositories/harness-recovery';
import { AiRuntimeProviderRepository } from './repositories/ai-runtime-provider';
import { ComputerNativeMcpPolicyRepository } from './repositories/computer-native-mcp-policy';
import { ComputerRuntimesRepository } from './repositories/computer-runtimes';
import { AiAgentRunsRepository } from './repositories/ai-agent-runs';
import { DshSessionsRepository } from './repositories/dsh-sessions';
import { HarnessCoordinationRepository } from './repositories/harness-coordination';
import { HarnessDeliveriesRepository } from './repositories/harness-deliveries';
import { TIME_ZONE } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import type { Logger } from '@smarteverything/logging';
import { StoreContext } from './context';
import { ChangeFeed } from './feed';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { AssistantRepository } from './repositories/assistant';
import { AssistantChatRepository } from './repositories/assistant-chat';
import { AssistantMessageSearchRepository } from './repositories/assistant-message-search';
import { AiProviderRepository } from './repositories/ai-provider';
import { AiEngineDefaultsRepository } from './repositories/ai-engine-defaults';
import { AiChatsRepository } from './repositories/ai-chats';
import { AssistantEventsRepository } from './repositories/assistant-events';
import { AutomationsRepository } from './repositories/automations';
import { BodyReadingsRepository } from './repositories/body-readings';
import { CamerasRepository } from './repositories/cameras';
import { ClientsRepository } from './repositories/clients';
import { CommandsRepository } from './repositories/commands';
import { DevicesRepository } from './repositories/devices';
import { EventsRepository } from './repositories/events';
import { FoodsRepository } from './repositories/foods';
import { HealthEntriesRepository } from './repositories/health-entries';
import { HealthRecordsRepository } from './repositories/health-records';
import { HealthSourcesRepository } from './repositories/health-sources';
import { WatchDaysRepository } from './repositories/watch-days';
import { InfraredRepository } from './repositories/infrared';
import { LocalDevicesRepository } from './repositories/local-devices';
import { PhoneContextsRepository } from './repositories/phone-contexts';
import { OAuthRepository } from './repositories/oauth';
import { PersonalRepository } from './repositories/personal';
import { ProfilesRepository } from './repositories/profiles';
import { ProvidersRepository } from './repositories/providers';
import { RoomsRepository } from './repositories/rooms';
import { ScenesRepository } from './repositories/scenes';
import { SettingsRepository } from './repositories/settings';
import { StateRepository } from './repositories/state';
import { DeviceMetricsRepository } from './repositories/device-metrics';
import { ComputerAiRepository } from './repositories/computer-ai';
import { ComputerNodesRepository } from './repositories/computer-nodes';
import { ComputerScopesRepository } from './repositories/computer-scopes';
import { AppSessionsRepository } from './repositories/app-sessions';
import { TalkRepository } from './repositories/talk';
import { WeatherRepository } from './repositories/weather';
import { ExchangeRatesRepository } from './repositories/exchange-rates';
import { SchedulesRepository } from './repositories/schedules';
import { PluginDataRepository } from './repositories/plugin-data';
import { PluginPeopleRepository } from './repositories/plugin-people';
import { TranscriptsRepository } from './repositories/transcripts';
import { PluginsRepository } from './repositories/plugins';
import { AiWakesRepository } from './repositories/ai-wakes';
import { AiOutreachRepository } from './repositories/ai-outreach';
import { Sql } from './sql';
import { Ledger } from '../ledger/ledger';
import { AiModelsRepository } from '../openrouter/models-repository';
import { durableSessionWrite } from './repositories/dsh-session-durability';

export interface StoreOptions {
  readonly path: string;
  readonly log: Logger;
  readonly now: () => Date;
  readonly systemTimeZone: string;
}

export interface Store {
  readonly feed: ChangeFeed;
  readonly settings: SettingsRepository;
  readonly clients: ClientsRepository;
  readonly providers: ProvidersRepository;
  readonly rooms: RoomsRepository;
  readonly deviceGroups: DeviceGroupsRepository;
  readonly deviceEffects: DeviceEffectsRepository;
  readonly devices: DevicesRepository;
  readonly state: StateRepository;
  readonly deviceMetrics: DeviceMetricsRepository;
  readonly computerScopes: ComputerScopesRepository;
  readonly computerRuntimes: ComputerRuntimesRepository;
  readonly computerNativeMcpPolicy: ComputerNativeMcpPolicyRepository;
  readonly aiAgentRuns: AiAgentRunsRepository;
  readonly dshSessions: DshSessionsRepository;
  readonly harnessConfiguration: HarnessConfigurationRepository;
  readonly harnessSkillPresentations: HarnessSkillPresentationsRepository;
  readonly harnessSkillUpdates: HarnessSkillUpdatesRepository;
  readonly harnessCoordination: HarnessCoordinationRepository;
  readonly harnessChildren: HarnessChildrenRepository;
  readonly harnessRecovery: HarnessRecoveryRepository;
  readonly harnessDeliveries: HarnessDeliveriesRepository;
  readonly computerAi: ComputerAiRepository;
  readonly computerNodes: ComputerNodesRepository;
  readonly appSessions: AppSessionsRepository;
  readonly commands: CommandsRepository;
  readonly events: EventsRepository;
  readonly cameras: CamerasRepository;
  readonly infrared: InfraredRepository;
  readonly scenes: ScenesRepository;
  readonly automations: AutomationsRepository;
  readonly automationValues: AutomationValuesRepository;
  readonly automationSequences: AutomationSequencesRepository;
  readonly automationRuns: AutomationRunsRepository;
  readonly speech: SpeechRepository;
  readonly personal: PersonalRepository;
  readonly healthSources: HealthSourcesRepository;
  readonly health: HealthRecordsRepository;
  readonly healthEntries: HealthEntriesRepository;
  readonly foods: FoodsRepository;
  readonly watchDays: WatchDaysRepository;
  readonly assistant: AssistantRepository;
  readonly assistantChat: AssistantChatRepository;
  readonly imageOperations: ImageOperationsRepository;
  readonly claudeCliOperations: ClaudeCliOperationsRepository;
  readonly nativeCommandOperations: NativeCommandOperationsRepository;
  readonly assistantSearch: AssistantMessageSearchRepository;
  readonly aiChats: AiChatsRepository;
  readonly aiProjects: AiProjectsRepository;
  readonly previewErrorRules: PreviewErrorRulesRepository;
  readonly previewProjects: PreviewProjectsRepository;
  readonly aiRuntimeProvider: AiRuntimeProviderRepository;
  readonly aiProvider: AiProviderRepository;
  readonly aiEngineDefaults: AiEngineDefaultsRepository;
  readonly assistantEvents: AssistantEventsRepository;
  readonly oauth: OAuthRepository;
  readonly profiles: ProfilesRepository;
  readonly bodyReadings: BodyReadingsRepository;
  readonly localDevices: LocalDevicesRepository;
  readonly bleObservations: BleObservationsRepository;
  readonly phoneContexts: PhoneContextsRepository;
  readonly talk: TalkRepository;
  readonly weather: WeatherRepository;
  readonly exchangeRates: ExchangeRatesRepository;
  readonly schedules: SchedulesRepository;
  readonly plugins: PluginsRepository;
  readonly pluginData: PluginDataRepository;
  readonly pluginPeople: PluginPeopleRepository;
  readonly transcripts: TranscriptsRepository;
  readonly aiWakes: AiWakesRepository;
  readonly aiOutreach: AiOutreachRepository;
  readonly aiModels: AiModelsRepository;
  readonly ledger: Ledger;
  readonly write: <T>(work: () => T) => T;
  readonly durableWrite: <T>(work: () => T) => T;
  readonly close: () => void;
}

const BUSY_TIMEOUT_MS = 5000;

function openDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.exec(`pragma busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
  database.exec('pragma journal_mode = wal');
  database.exec('pragma synchronous = normal');
  database.exec('pragma foreign_keys = on');
  return database;
}

function startTimeZone(settings: SettingsRepository, options: StoreOptions): void {
  if (!TIME_ZONE.safeParse(options.systemTimeZone).success) {
    options.log.warn('settings.system_time_zone_unknown', { timeZone: options.systemTimeZone });
    return;
  }
  const start = settings.initialiseTimeZone(options.systemTimeZone);
  if (start.initialised) {
    options.log.info('settings.time_zone_initialised', { from: start.from, to: start.to });
  }
}

function healthRepositories(
  context: StoreContext,
): Pick<Store, 'health' | 'healthEntries' | 'watchDays'> {
  const watchDays = new WatchDaysRepository(context);
  const health = new HealthRecordsRepository(context, watchDays);
  return { health, healthEntries: new HealthEntriesRepository(context, health), watchDays };
}

function routineRepositories(
  context: StoreContext,
): Pick<Store, 'schedules' | 'aiWakes' | 'aiOutreach'> {
  return {
    schedules: new SchedulesRepository(context),
    aiWakes: new AiWakesRepository(context),
    aiOutreach: new AiOutreachRepository(context),
  };
}

function pluginRepositories(
  context: StoreContext,
): Pick<Store, 'plugins' | 'pluginData' | 'pluginPeople'> {
  return {
    plugins: new PluginsRepository(context),
    pluginData: new PluginDataRepository(context),
    pluginPeople: new PluginPeopleRepository(context),
  };
}

function computerRepositories(
  context: StoreContext,
): Pick<
  Store,
  | 'computerScopes'
  | 'computerAi'
  | 'computerRuntimes'
  | 'computerNativeMcpPolicy'
  | 'computerNodes'
  | 'appSessions'
> {
  return {
    computerScopes: new ComputerScopesRepository(context),
    computerAi: new ComputerAiRepository(context),
    computerNativeMcpPolicy: new ComputerNativeMcpPolicyRepository(context),
    computerRuntimes: new ComputerRuntimesRepository(context),
    computerNodes: new ComputerNodesRepository(context),
    appSessions: new AppSessionsRepository(context),
  };
}

function localRepositories(
  context: StoreContext,
): Pick<Store, 'localDevices' | 'phoneContexts' | 'bleObservations'> {
  return {
    localDevices: new LocalDevicesRepository(context),
    bleObservations: new BleObservationsRepository(context),
    phoneContexts: new PhoneContextsRepository(context),
  };
}

function projectRepositories(
  context: StoreContext,
): Pick<Store, 'aiProjects' | 'previewErrorRules' | 'previewProjects'> {
  return {
    aiProjects: new AiProjectsRepository(context),
    previewErrorRules: new PreviewErrorRulesRepository(context),
    previewProjects: new PreviewProjectsRepository(context),
  };
}

function assistantRepositories(
  context: StoreContext,
): Pick<
  Store,
  | 'assistant'
  | 'assistantChat'
  | 'imageOperations'
  | 'claudeCliOperations'
  | 'nativeCommandOperations'
  | 'assistantSearch'
  | 'aiChats'
  | 'aiEngineDefaults'
  | 'aiProvider'
  | 'aiRuntimeProvider'
  | 'aiAgentRuns'
  | 'dshSessions'
  | 'harnessConfiguration'
  | 'harnessSkillPresentations'
  | 'harnessCoordination'
  | 'harnessChildren'
  | 'harnessRecovery'
  | 'harnessDeliveries'
  | 'assistantEvents'
  | 'aiProjects'
  | 'previewErrorRules'
  | 'previewProjects'
> {
  return {
    assistant: new AssistantRepository(context),
    assistantChat: new AssistantChatRepository(context),
    imageOperations: new ImageOperationsRepository(context),
    claudeCliOperations: new ClaudeCliOperationsRepository(context),
    nativeCommandOperations: new NativeCommandOperationsRepository(context),
    assistantSearch: new AssistantMessageSearchRepository(context),
    aiChats: new AiChatsRepository(context),
    ...projectRepositories(context),
    aiProvider: new AiProviderRepository(context),
    aiRuntimeProvider: new AiRuntimeProviderRepository(context),
    aiAgentRuns: new AiAgentRunsRepository(context),
    dshSessions: new DshSessionsRepository(context),
    harnessConfiguration: new HarnessConfigurationRepository(context),
    harnessSkillPresentations: new HarnessSkillPresentationsRepository(context),
    harnessCoordination: new HarnessCoordinationRepository(context),
    harnessChildren: new HarnessChildrenRepository(context),
    harnessRecovery: new HarnessRecoveryRepository(context),
    harnessDeliveries: new HarnessDeliveriesRepository(context),
    aiEngineDefaults: new AiEngineDefaultsRepository(context),
    assistantEvents: new AssistantEventsRepository(context),
  };
}

function scalarRepositories(context: StoreContext): Pick<Store, 'weather' | 'exchangeRates'> {
  const weather = new WeatherRepository(context);
  weather.ensure();
  const exchangeRates = new ExchangeRatesRepository(context);
  exchangeRates.ensure();
  return { weather, exchangeRates };
}

function automationRepositories(
  context: StoreContext,
): Pick<
  Store,
  'automations' | 'automationValues' | 'automationRuns' | 'automationSequences' | 'speech'
> {
  return {
    automations: new AutomationsRepository(context),
    speech: new SpeechRepository(context),
    automationSequences: new AutomationSequencesRepository(context),
    automationValues: new AutomationValuesRepository(context),
    automationRuns: new AutomationRunsRepository(context),
  };
}

function roomRepositories(context: StoreContext): Pick<Store, 'rooms' | 'deviceGroups'> {
  return { rooms: new RoomsRepository(context), deviceGroups: new DeviceGroupsRepository(context) };
}

function commandRepositories(context: StoreContext): Pick<Store, 'commands' | 'deviceEffects'> {
  return {
    commands: new CommandsRepository(context),
    deviceEffects: new DeviceEffectsRepository(context),
  };
}
export function openStore(options: StoreOptions): Store {
  const database = openDatabase(options.path);
  const sql = new Sql(database);
  const version = migrate(sql, MIGRATIONS, options.now().toISOString(), options.log);
  const feed = new ChangeFeed(options.log);
  const context = new StoreContext(sql, feed, options.now);
  const settings = new SettingsRepository(context);
  settings.ensure();
  startTimeZone(settings, options);
  options.log.info('store.opened', { version });
  return {
    feed,
    settings,
    harnessSkillUpdates: new HarnessSkillUpdatesRepository(context),
    clients: new ClientsRepository(context),
    providers: new ProvidersRepository(context),
    ...roomRepositories(context),
    devices: new DevicesRepository(context),
    state: new StateRepository(context),
    deviceMetrics: new DeviceMetricsRepository(context),
    ...computerRepositories(context),
    ...commandRepositories(context),
    events: new EventsRepository(context),
    cameras: new CamerasRepository(context),
    infrared: new InfraredRepository(context),
    scenes: new ScenesRepository(context),
    ...automationRepositories(context),
    personal: new PersonalRepository(context),
    healthSources: new HealthSourcesRepository(context),
    ...healthRepositories(context),
    foods: new FoodsRepository(context),
    ...assistantRepositories(context),
    oauth: new OAuthRepository(context),
    profiles: new ProfilesRepository(context),
    bodyReadings: new BodyReadingsRepository(context),
    ...localRepositories(context),
    talk: new TalkRepository(context),
    ...scalarRepositories(context),
    ...routineRepositories(context),
    aiModels: new AiModelsRepository(context),
    ...pluginRepositories(context),
    transcripts: new TranscriptsRepository(context),
    ledger: new Ledger(context, () => settings.read().time_zone),
    write: (work) => context.write(work),
    durableWrite: (work) => durableSessionWrite(context, work),
    close: (): void => {
      database.close();
    },
  };
}
