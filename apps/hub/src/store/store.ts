import { TIME_ZONE } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import type { Logger } from '@smarteverything/logging';
import { StoreContext } from './context';
import { ChangeFeed } from './feed';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { AssistantRepository } from './repositories/assistant';
import { AssistantChatRepository } from './repositories/assistant-chat';
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
import { ComputerScopesRepository } from './repositories/computer-scopes';
import { AppSessionsRepository } from './repositories/app-sessions';
import { TalkRepository } from './repositories/talk';
import { WeatherRepository } from './repositories/weather';
import { SchedulesRepository } from './repositories/schedules';
import { PluginDataRepository } from './repositories/plugin-data';
import { PluginsRepository } from './repositories/plugins';
import { AiWakesRepository } from './repositories/ai-wakes';
import { AiOutreachRepository } from './repositories/ai-outreach';
import { Sql } from './sql';
import { Ledger } from '../ledger/ledger';
import { AiModelsRepository } from '../openrouter/models-repository';

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
  readonly devices: DevicesRepository;
  readonly state: StateRepository;
  readonly deviceMetrics: DeviceMetricsRepository;
  readonly computerScopes: ComputerScopesRepository;
  readonly appSessions: AppSessionsRepository;
  readonly commands: CommandsRepository;
  readonly events: EventsRepository;
  readonly cameras: CamerasRepository;
  readonly infrared: InfraredRepository;
  readonly scenes: ScenesRepository;
  readonly automations: AutomationsRepository;
  readonly personal: PersonalRepository;
  readonly healthSources: HealthSourcesRepository;
  readonly health: HealthRecordsRepository;
  readonly healthEntries: HealthEntriesRepository;
  readonly foods: FoodsRepository;
  readonly watchDays: WatchDaysRepository;
  readonly assistant: AssistantRepository;
  readonly assistantChat: AssistantChatRepository;
  readonly aiChats: AiChatsRepository;
  readonly assistantEvents: AssistantEventsRepository;
  readonly oauth: OAuthRepository;
  readonly profiles: ProfilesRepository;
  readonly bodyReadings: BodyReadingsRepository;
  readonly localDevices: LocalDevicesRepository;
  readonly phoneContexts: PhoneContextsRepository;
  readonly talk: TalkRepository;
  readonly weather: WeatherRepository;
  readonly schedules: SchedulesRepository;
  readonly plugins: PluginsRepository;
  readonly pluginData: PluginDataRepository;
  readonly aiWakes: AiWakesRepository;
  readonly aiOutreach: AiOutreachRepository;
  readonly aiModels: AiModelsRepository;
  readonly ledger: Ledger;
  readonly write: <T>(work: () => T) => T;
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

function computerRepositories(
  context: StoreContext,
): Pick<Store, 'computerScopes' | 'appSessions'> {
  return {
    computerScopes: new ComputerScopesRepository(context),
    appSessions: new AppSessionsRepository(context),
  };
}

function localRepositories(context: StoreContext): Pick<Store, 'localDevices' | 'phoneContexts'> {
  return {
    localDevices: new LocalDevicesRepository(context),
    phoneContexts: new PhoneContextsRepository(context),
  };
}

function assistantRepositories(
  context: StoreContext,
): Pick<Store, 'assistant' | 'assistantChat' | 'aiChats' | 'assistantEvents'> {
  return {
    assistant: new AssistantRepository(context),
    assistantChat: new AssistantChatRepository(context),
    aiChats: new AiChatsRepository(context),
    assistantEvents: new AssistantEventsRepository(context),
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
  const weather = new WeatherRepository(context);
  weather.ensure();
  options.log.info('store.opened', { version });
  return {
    feed,
    settings,
    clients: new ClientsRepository(context),
    providers: new ProvidersRepository(context),
    rooms: new RoomsRepository(context),
    devices: new DevicesRepository(context),
    state: new StateRepository(context),
    deviceMetrics: new DeviceMetricsRepository(context),
    ...computerRepositories(context),
    commands: new CommandsRepository(context),
    events: new EventsRepository(context),
    cameras: new CamerasRepository(context),
    infrared: new InfraredRepository(context),
    scenes: new ScenesRepository(context),
    automations: new AutomationsRepository(context),
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
    weather,
    ...routineRepositories(context),
    aiModels: new AiModelsRepository(context),
    plugins: new PluginsRepository(context),
    pluginData: new PluginDataRepository(context),
    ledger: new Ledger(context, () => settings.read().time_zone),
    write: (work) => context.write(work),
    close: (): void => {
      database.close();
    },
  };
}
