import type { AppHref } from '../components/app-href';
import { isCamera } from '@smarteverything/domain';
import type { Device } from '../store/state';
import { selectionOf, selectionParams } from '../features/home-map/model/selection';
import type { LibraryTabId } from '../features/photos/model/library-tabs';

export const UPDATES_SETTINGS_PAGE = 'app-updates';

interface AssistantChatOptions {
  readonly section?: 'browser';
  readonly message?: string;
  readonly work?: string;
  readonly operation?: string;
  readonly browserAction?: string;
}

function assistantChatParams(options: AssistantChatOptions): Readonly<Record<string, string>> {
  return {
    ...(options.section === undefined ? {} : { section: options.section }),
    ...(options.message === undefined ? {} : { message: options.message }),
    ...(options.work === undefined ? {} : { work: options.work }),
    ...(options.operation === undefined ? {} : { operation: options.operation }),
    ...(options.browserAction === undefined ? {} : { browserAction: options.browserAction }),
  };
}

interface HomeReveal {
  readonly reveal: string;
  readonly member?: string;
}

export interface GroupPageOptions {
  readonly member?: string | undefined;
  readonly edit?: boolean | undefined;
  readonly focus?: string | undefined;
}

function groupPageParams(options: GroupPageOptions): Readonly<Record<string, string>> {
  return {
    ...(options.member === undefined ? {} : { member: options.member }),
    ...(options.edit === true ? { edit: '1' } : {}),
    ...(options.focus === undefined ? {} : { focus: options.focus }),
  };
}

export interface PhotosLibraryParams {
  readonly tab?: Exclude<LibraryTabId, 'all'>;
  readonly q?: string;
}

function photosLibraryQuery(params: PhotosLibraryParams): Readonly<Record<string, string>> {
  return {
    ...(params.tab === undefined ? {} : { tab: params.tab }),
    ...(params.q === undefined || params.q === '' ? {} : { q: params.q }),
  };
}

export const href = {
  home: (target?: HomeReveal): AppHref =>
    target === undefined
      ? '/'
      : {
          pathname: '/',
          params: {
            reveal: target.reveal,
            ...(target.member === undefined ? {} : { member: target.member }),
          },
        },
  devicesPage: (page: 'air' | 'supplies'): AppHref => `/devices/${page}`,
  cameras: (): AppHref => '/cameras',
  fitness: (): AppHref => '/fitness',
  planner: {
    index: (): AppHref => '/planner',
    tasks: (): AppHref => '/planner/tasks',
    calendar: (): AppHref => '/planner/calendar',
    insights: (): AppHref => '/planner/insights',
    item: (itemId: string, occurrence: string | null): AppHref => ({
      pathname: '/planner/item/[itemId]',
      params: occurrence === null ? { itemId } : { itemId, occurrence },
    }),
  },
  clock: {
    alarms: (): AppHref => '/clock',
    timers: (): AppHref => '/clock/timers',
    stopwatch: (): AppHref => '/clock/stopwatch',
    world: (): AppHref => '/clock/world',
    ring: (ringId: string): AppHref => ({
      pathname: '/clock/ring/[ringId]',
      params: { ringId },
    }),
  },
  photos: (params: PhotosLibraryParams = {}): AppHref => {
    const query = photosLibraryQuery(params);
    return Object.keys(query).length === 0 ? '/photos' : { pathname: '/photos', params: query };
  },
  photosPage: (
    page: 'albums' | 'map' | 'insights' | 'deleted',
    params: Readonly<Record<string, string>> = {},
  ): AppHref => ({ pathname: `/photos/${page}`, params }),
  photosAlbum: (albumId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/albums/[albumId]',
    params: { ...params, albumId },
  }),
  photosPlace: (placeId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/places/[placeId]',
    params: { ...params, placeId },
  }),
  photosItem: (itemId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/photos/view/[itemId]',
    params: { ...params, itemId },
  }),
  drive: (): AppHref => '/drive',
  drivePage: (
    page: 'recent' | 'starred' | 'shared' | 'activity' | 'sync' | 'computers' | 'storage' | 'trash',
    params: Readonly<Record<string, string>> = {},
  ): AppHref => ({ pathname: `/drive/${page}`, params }),
  driveRoot: (rootId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/drive/root/[rootId]',
    params: { ...params, rootId },
  }),
  driveSyncFolder: (rootId: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/drive/sync/[rootId]',
    params: { ...params, rootId },
  }),
  automations: (): AppHref => '/automations',
  automation: (automationId: string): AppHref => ({
    pathname: '/automations/[automationId]',
    params: { automationId },
  }),
  automationEdit: (automationId: string, focus?: string): AppHref => ({
    pathname: '/automations/[automationId]/edit',
    params: {
      automationId,
      ...(focus === undefined ? {} : { focus }),
    },
  }),
  automationNew: (template?: string): AppHref =>
    template === undefined
      ? '/automations/new'
      : { pathname: '/automations/new', params: { template } },
  automationRuns: (automationId?: string, focus?: string): AppHref =>
    automationId === undefined
      ? { pathname: '/automations/runs', params: focus === undefined ? {} : { focus } }
      : {
          pathname: '/automations/[automationId]/runs',
          params: { automationId, ...(focus === undefined ? {} : { focus }) },
        },
  automationValues: (): AppHref => '/automations/variables',
  automationValue: (variableId: string, focus?: string): AppHref => ({
    pathname: '/automations/variables/[variableId]',
    params: { variableId, ...(focus === undefined ? {} : { focus }) },
  }),
  automationSchedule: (): AppHref => '/automations/schedule',
  scheduled: (): AppHref => '/automations/scheduled',
  scheduledItem: (scheduleId: string): AppHref => ({
    pathname: '/automations/scheduled/[scheduleId]',
    params: { scheduleId },
  }),
  scheduledEdit: (scheduleId: string): AppHref => ({
    pathname: '/automations/scheduled/[scheduleId]/edit',
    params: { scheduleId },
  }),
  scheduledNew: (deviceId?: string): AppHref =>
    deviceId === undefined
      ? '/automations/scheduled/new'
      : { pathname: '/automations/scheduled/new', params: { deviceId } },
  scenes: (): AppHref => '/automations/scenes',
  scene: (sceneId: string): AppHref => ({
    pathname: '/automations/scenes/[sceneId]',
    params: { sceneId },
  }),
  assistantCosts: (filters?: { readonly chat?: string }): AppHref =>
    filters?.chat === undefined
      ? '/settings/assistant/costs'
      : { pathname: '/settings/assistant/costs', params: { chat: filters.chat } },
  assistantChat: (chatId?: string, options: AssistantChatOptions = {}): AppHref =>
    chatId === undefined
      ? '/assistant'
      : {
          pathname: '/assistant/chat/[chatId]',
          params: {
            chatId,
            ...assistantChatParams(options),
          },
        },
  assistantChatFiles: (chatId: string): AppHref => ({
    pathname: '/assistant/chat/[chatId]/files',
    params: { chatId },
  }),
  assistantChats: (filter: 'unread' | 'archived'): AppHref => ({
    pathname: '/assistant',
    params: { filter },
  }),
  talk: (): AppHref => '/talk',
  talkChannel: (channelId: string): AppHref => ({
    pathname: '/talk/[channelId]',
    params: { channelId },
  }),
  devices: (status?: 'offline'): AppHref =>
    status === undefined ? '/devices' : { pathname: '/devices', params: { status } },
  devicesSelection: (selection: {
    readonly room?: string | undefined;
    readonly device?: string | undefined;
  }): AppHref => {
    const params = selectionParams(selectionOf(selection));
    return Object.keys(params).length === 0 ? '/devices' : { pathname: '/devices', params };
  },
  activity: (): AppHref => '/activity',
  weather: (): AppHref => '/weather',
  room: (roomId: string): AppHref => ({ pathname: '/rooms/[roomId]', params: { roomId } }),
  roomLights: (roomId: string, options: GroupPageOptions = {}): AppHref => ({
    pathname: '/rooms/[roomId]/lights',
    params: { roomId, ...groupPageParams(options) },
  }),
  group: (groupId: string, options: GroupPageOptions = {}): AppHref => ({
    pathname: '/groups/[groupId]',
    params: { groupId, ...groupPageParams(options) },
  }),
  newGroup: (): AppHref => '/groups/new',
  search: (query = ''): AppHref =>
    query === '' ? '/search' : { pathname: '/search', params: { q: query } },
  device: (device: Pick<Device, 'id' | 'kind' | 'model'>): AppHref =>
    isCamera(device)
      ? { pathname: '/cameras/[cameraId]', params: { cameraId: device.id } }
      : { pathname: '/device/[deviceId]', params: { deviceId: device.id } },
  camera: (cameraId: string, mode: 'call' | 'full' | null = null): AppHref => ({
    pathname: '/cameras/[cameraId]',
    params: mode === null ? { cameraId } : { cameraId, [mode]: '1' },
  }),
  clip: (cameraId: string, recordingId: string): AppHref => ({
    pathname: '/cameras/[cameraId]/clip/[recordingId]',
    params: { cameraId, recordingId },
  }),
  cameraEvents: (): AppHref => '/cameras/events',
  cameraMonitor: (): AppHref => '/cameras/monitor',
  deviceSection: (
    deviceId: string,
    section: string,
    query: Readonly<Record<string, string>> = {},
  ): AppHref => ({
    pathname: '/device/[deviceId]/[section]',
    params: { ...query, deviceId, section },
  }),
  pluginSettings: (pluginId: string, page?: 'tools' | 'log' | 'people'): AppHref => ({
    pathname: '/settings/[...page]',
    params: { page: page === undefined ? ['plugins', pluginId] : ['plugins', pluginId, page] },
  }),
  pluginPage: (pluginId: string, pageId: string): AppHref => ({
    pathname: '/plugins/[pluginId]/[page]',
    params: { pluginId, page: pageId },
  }),
  pluginList: (pluginId: string, setting: string): AppHref => ({
    pathname: '/settings/[...page]',
    params: { page: ['plugins', pluginId, 'list', setting] },
  }),
  settings: {
    index: (): AppHref => '/settings',
    page: (path: string): AppHref => ({
      pathname: '/settings/[...page]',
      params: { page: path.split('/') },
    }),
    focus: (path: string, focus: string): AppHref => ({
      pathname: '/settings/[...page]',
      params: { page: path.split('/'), focus },
    }),
    connections: (): AppHref => ({
      pathname: '/settings/[...page]',
      params: { page: ['connections'] },
    }),
    device: (
      deviceId: string,
      page?: string,
      query: Readonly<Record<string, string>> = {},
    ): AppHref =>
      page === undefined
        ? { pathname: '/device/[deviceId]/settings', params: { deviceId } }
        : { pathname: '/device/[deviceId]/settings/[page]', params: { ...query, deviceId, page } },
    cameras: (): AppHref => '/settings/cameras',
    talk: (): AppHref => '/settings/talk',
    talkChannel: (channelId: string): AppHref => ({
      pathname: '/settings/[...page]',
      params: { page: ['talk', 'channels', channelId] },
    }),
    camera: (deviceId: string): AppHref => ({
      pathname: '/device/[deviceId]/settings/[page]',
      params: { deviceId, page: 'camera' },
    }),
    remoteViewing: (): AppHref => '/settings/cameras/remote-viewing',
    assistant: (): AppHref => '/settings/assistant',
    profile: (profileId: string): AppHref => ({
      pathname: '/settings/profiles/[profileId]',
      params: { profileId },
    }),
    account: (provider: string): AppHref => ({
      pathname: '/settings/connections/[provider]',
      params: { provider },
    }),
  },
  connect: (
    flow:
      | 'xiaomi'
      | 'tuya'
      | 'smartthings'
      | 'scale'
      | 'watch'
      | 'treadmill'
      | 'sonicare'
      | 'larq'
      | 'printer',
  ): AppHref => `/connect/${flow}`,
  assistant: (assistant: string): AppHref => ({
    pathname: '/connect/assistant/[assistant]',
    params: { assistant },
  }),
  consent: (requestId: string): AppHref => ({
    pathname: '/consent/[requestId]',
    params: { requestId },
  }),
  firewallFix: (): AppHref => '/firewall-fix',
  setupNetwork: (): AppHref => '/setup/network',
  assistantCall: (
    source: string,
    chatId: string | null = null,
    answering: string | null = null,
  ): AppHref => ({
    pathname: '/assistant/call',
    params: {
      source,
      ...(chatId === null ? {} : { chatId }),
      ...(answering === null ? {} : { answering }),
    },
  }),
  assistantVoiceMessage: (): AppHref => '/assistant/voice-message',
  pairPhone: (profileId?: string): AppHref =>
    profileId === undefined ? '/pair-phone' : { pathname: '/pair-phone', params: { profileId } },
  fitnessSetup: (step?: 'about' | 'goals' | 'connect'): AppHref =>
    step === undefined ? '/fitness-setup' : { pathname: '/fitness-setup', params: { step } },
  addByAddress: (): AppHref => '/add-by-address',
  fitnessPage: (
    page: 'activity' | 'heart' | 'sleep' | 'body' | 'workouts' | 'vitals' | 'browse' | 'nutrition',
    params: Readonly<Record<string, string>> = {},
  ): AppHref => ({ pathname: `/fitness/${page}`, params }),
  workout: (workoutId: string): AppHref => ({
    pathname: '/fitness/workouts/[workoutId]',
    params: { workoutId },
  }),
  logFood: (params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/log-food',
    params,
  }),
  scanFood: (params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/scan-food',
    params,
  }),
  food: (foodId: string): AppHref => ({ pathname: '/food/[foodId]', params: { foodId } }),
  newFood: (params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/food/new',
    params,
  }),
  logHealth: (type?: string, params: Readonly<Record<string, string>> = {}): AppHref =>
    type === undefined
      ? { pathname: '/log', params }
      : { pathname: '/log/[type]', params: { ...params, type } },
  healthMetric: (metric: string, params: Readonly<Record<string, string>> = {}): AppHref => ({
    pathname: '/fitness/metric/[metric]',
    params: { ...params, metric },
  }),
};
