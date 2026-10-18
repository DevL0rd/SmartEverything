import type { Href } from 'expo-router';
import { isCamera } from '@smarteverything/domain';
import type { Device } from '../store/state';

interface AssistantChatOptions {
  readonly sheet?: 'chat';
  readonly section?: 'overview' | 'activity' | 'files' | 'branches' | 'tools' | 'browser';
  readonly agent?: string;
  readonly message?: string;
  readonly work?: string;
  readonly operation?: string;
  readonly browserAction?: string;
}

function assistantChatParams(options: AssistantChatOptions): Readonly<Record<string, string>> {
  return {
    ...(options.sheet === undefined ? {} : { sheet: options.sheet }),
    ...(options.section === undefined ? {} : { section: options.section }),
    ...(options.agent === undefined ? {} : { agent: options.agent }),
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

export const href = {
  home: (target?: HomeReveal): Href =>
    target === undefined
      ? '/'
      : {
          pathname: '/',
          params: {
            reveal: target.reveal,
            ...(target.member === undefined ? {} : { member: target.member }),
          },
        },
  devicesPage: (page: 'air' | 'supplies'): Href => `/devices/${page}`,
  cameras: (): Href => '/cameras',
  fitness: (): Href => '/fitness',
  automations: (): Href => '/automations',
  automation: (automationId: string, idea?: string, focus?: string): Href => ({
    pathname: '/automations/[automationId]',
    params: {
      automationId,
      ...(idea === undefined ? {} : { idea }),
      ...(focus === undefined ? {} : { focus }),
    },
  }),
  automationRuns: (automationId?: string, focus?: string): Href =>
    automationId === undefined
      ? { pathname: '/automations/runs', params: focus === undefined ? {} : { focus } }
      : {
          pathname: '/automations/[automationId]/runs',
          params: { automationId, ...(focus === undefined ? {} : { focus }) },
        },
  automationValues: (): Href => '/automations/values',
  automationValue: (valueId: string, focus?: string): Href => ({
    pathname: '/automations/values/[valueId]',
    params: { valueId, ...(focus === undefined ? {} : { focus }) },
  }),
  automationSequences: (): Href => '/automations/sequences',
  automationSequence: (sequenceId: string, focus?: string): Href => ({
    pathname: '/automations/sequences/[sequenceId]',
    params: { sequenceId, ...(focus === undefined ? {} : { focus }) },
  }),
  automationSchedule: (): Href => '/automations/schedule',
  scheduled: (): Href => '/automations/scheduled',
  scheduledItem: (scheduleId: string): Href => ({
    pathname: '/automations/scheduled/[scheduleId]',
    params: { scheduleId },
  }),
  scheduledEdit: (scheduleId: string): Href => ({
    pathname: '/automations/scheduled/[scheduleId]/edit',
    params: { scheduleId },
  }),
  scheduledNew: (deviceId?: string): Href =>
    deviceId === undefined
      ? '/automations/scheduled/new'
      : { pathname: '/automations/scheduled/new', params: { deviceId } },
  scenes: (): Href => '/automations/scenes',
  scene: (sceneId: string): Href => ({
    pathname: '/automations/scenes/[sceneId]',
    params: { sceneId },
  }),
  assistantCosts: (filters?: { readonly chat?: string }): Href =>
    filters?.chat === undefined
      ? '/settings/assistant/costs'
      : { pathname: '/settings/assistant/costs', params: { chat: filters.chat } },
  assistantChat: (chatId?: string, options: AssistantChatOptions = {}): Href =>
    chatId === undefined
      ? '/assistant'
      : {
          pathname: '/assistant/chat/[chatId]',
          params: {
            chatId,
            ...assistantChatParams(options),
          },
        },
  assistantChats: (filter: 'unread' | 'archived'): Href => ({
    pathname: '/assistant',
    params: { filter },
  }),
  talk: (): Href => '/talk',
  talkChannel: (channelId: string): Href => ({
    pathname: '/talk/[channelId]',
    params: { channelId },
  }),
  devices: (status?: 'offline'): Href =>
    status === undefined ? '/devices' : { pathname: '/devices', params: { status } },
  activity: (): Href => '/activity',
  weather: (): Href => '/weather',
  room: (roomId: string): Href => ({ pathname: '/rooms/[roomId]', params: { roomId } }),
  roomLights: (roomId: string, options: GroupPageOptions = {}): Href => ({
    pathname: '/rooms/[roomId]/lights',
    params: { roomId, ...groupPageParams(options) },
  }),
  group: (groupId: string, options: GroupPageOptions = {}): Href => ({
    pathname: '/groups/[groupId]',
    params: { groupId, ...groupPageParams(options) },
  }),
  newGroup: (): Href => '/groups/new',
  search: (query = ''): Href =>
    query === '' ? '/search' : { pathname: '/search', params: { q: query } },
  device: (device: Pick<Device, 'id' | 'kind' | 'model'>): Href =>
    isCamera(device)
      ? { pathname: '/cameras/[cameraId]', params: { cameraId: device.id } }
      : { pathname: '/device/[deviceId]', params: { deviceId: device.id } },
  camera: (cameraId: string, mode: 'call' | 'full' | null = null): Href => ({
    pathname: '/cameras/[cameraId]',
    params: mode === null ? { cameraId } : { cameraId, [mode]: '1' },
  }),
  clip: (cameraId: string, recordingId: string): Href => ({
    pathname: '/cameras/[cameraId]/clip/[recordingId]',
    params: { cameraId, recordingId },
  }),
  cameraEvents: (): Href => '/cameras/events',
  cameraMonitor: (): Href => '/cameras/monitor',
  deviceSection: (
    deviceId: string,
    section: string,
    query: Readonly<Record<string, string>> = {},
  ): Href => ({
    pathname: '/device/[deviceId]/[section]',
    params: { ...query, deviceId, section },
  }),
  pluginSettings: (pluginId: string, page?: 'tools' | 'log' | 'people'): Href => ({
    pathname: '/settings/[...page]',
    params: { page: page === undefined ? ['plugins', pluginId] : ['plugins', pluginId, page] },
  }),
  pluginList: (pluginId: string, setting: string): Href => ({
    pathname: '/settings/[...page]',
    params: { page: ['plugins', pluginId, 'list', setting] },
  }),
  settings: {
    index: (): Href => '/settings',
    page: (path: string): Href => ({
      pathname: '/settings/[...page]',
      params: { page: path.split('/') },
    }),
    focus: (path: string, focus: string): Href => ({
      pathname: '/settings/[...page]',
      params: { page: path.split('/'), focus },
    }),
    connections: (): Href => ({
      pathname: '/settings/[...page]',
      params: { page: ['connections'] },
    }),
    device: (
      deviceId: string,
      page?: string,
      query: Readonly<Record<string, string>> = {},
    ): Href =>
      page === undefined
        ? { pathname: '/device/[deviceId]/settings', params: { deviceId } }
        : { pathname: '/device/[deviceId]/settings/[page]', params: { ...query, deviceId, page } },
    cameras: (): Href => '/settings/cameras',
    talk: (): Href => '/settings/talk',
    talkChannel: (channelId: string): Href => ({
      pathname: '/settings/[...page]',
      params: { page: ['talk', 'channels', channelId] },
    }),
    camera: (deviceId: string): Href => ({
      pathname: '/device/[deviceId]/settings/[page]',
      params: { deviceId, page: 'camera' },
    }),
    remoteViewing: (): Href => '/settings/cameras/remote-viewing',
    assistant: (): Href => '/settings/assistant',
    profile: (profileId: string): Href => ({
      pathname: '/settings/profiles/[profileId]',
      params: { profileId },
    }),
    account: (provider: string): Href => ({
      pathname: '/settings/connections/[provider]',
      params: { provider },
    }),
  },
  connect: (flow: 'xiaomi' | 'tuya' | 'tuya-developer' | 'smartthings' | 'scale' | 'watch'): Href =>
    `/connect/${flow}`,
  assistant: (assistant: string): Href => ({
    pathname: '/connect/assistant/[assistant]',
    params: { assistant },
  }),
  consent: (requestId: string): Href => ({
    pathname: '/consent/[requestId]',
    params: { requestId },
  }),
  firewallFix: (): Href => '/firewall-fix',
  assistantCall: (
    source: string,
    chatId: string | null = null,
    answering: string | null = null,
  ): Href => ({
    pathname: '/assistant/call',
    params: {
      source,
      ...(chatId === null ? {} : { chatId }),
      ...(answering === null ? {} : { answering }),
    },
  }),
  pairPhone: (profileId?: string): Href =>
    profileId === undefined ? '/pair-phone' : { pathname: '/pair-phone', params: { profileId } },
  fitnessSetup: (step?: 'about' | 'goals' | 'connect'): Href =>
    step === undefined ? '/fitness-setup' : { pathname: '/fitness-setup', params: { step } },
  addByAddress: (): Href => '/add-by-address',
  fitnessPage: (
    page: 'activity' | 'heart' | 'sleep' | 'body' | 'workouts' | 'vitals' | 'browse' | 'nutrition',
    params: Readonly<Record<string, string>> = {},
  ): Href => ({ pathname: `/fitness/${page}`, params }),
  workout: (workoutId: string): Href => ({
    pathname: '/fitness/workouts/[workoutId]',
    params: { workoutId },
  }),
  logFood: (params: Readonly<Record<string, string>> = {}): Href => ({
    pathname: '/log-food',
    params,
  }),
  scanFood: (params: Readonly<Record<string, string>> = {}): Href => ({
    pathname: '/scan-food',
    params,
  }),
  food: (foodId: string): Href => ({ pathname: '/food/[foodId]', params: { foodId } }),
  newFood: (params: Readonly<Record<string, string>> = {}): Href => ({
    pathname: '/food/new',
    params,
  }),
  logHealth: (type?: string, params: Readonly<Record<string, string>> = {}): Href =>
    type === undefined
      ? { pathname: '/log', params }
      : { pathname: '/log/[type]', params: { ...params, type } },
  healthMetric: (metric: string, params: Readonly<Record<string, string>> = {}): Href => ({
    pathname: '/fitness/metric/[metric]',
    params: { ...params, metric },
  }),
};
