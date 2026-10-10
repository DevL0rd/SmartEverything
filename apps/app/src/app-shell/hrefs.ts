import type { Href } from 'expo-router';
import { isCamera } from '@smarteverything/domain';
import { mountedHref } from '../settings/mounts';
import type { Device } from '../store/state';

export const href = {
  home: (): Href => '/',
  devicesPage: (page: 'air' | 'supplies'): Href => `/devices/${page}`,
  cameras: (): Href => '/cameras',
  fitness: (): Href => '/fitness',
  automations: (): Href => '/automations',
  automation: (automationId: string, idea?: string): Href => ({
    pathname: '/automations/[automationId]',
    params: idea === undefined ? { automationId } : { automationId, idea },
  }),
  automationRuns: (automationId?: string): Href =>
    automationId === undefined
      ? '/automations/runs'
      : { pathname: '/automations/[automationId]/runs', params: { automationId } },
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
  more: (): Href => '/more',
  assistantCosts: (filters?: { readonly chat?: string }): Href =>
    filters?.chat === undefined
      ? '/settings/assistant/costs'
      : { pathname: '/settings/assistant/costs', params: { chat: filters.chat } },
  assistantChat: (
    chatId?: string,
    options: { readonly sheet?: 'chat'; readonly message?: string } = {},
  ): Href =>
    chatId === undefined
      ? '/assistant'
      : {
          pathname: '/assistant/chat/[chatId]',
          params: {
            chatId,
            ...(options.sheet === undefined ? {} : { sheet: options.sheet }),
            ...(options.message === undefined ? {} : { message: options.message }),
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
  deviceSection: (deviceId: string, section: string): Href => ({
    pathname: '/device/[deviceId]/[section]',
    params: { deviceId, section },
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
    page: (path: string): Href =>
      mountedHref(path) ?? { pathname: '/settings/[...page]', params: { page: path.split('/') } },
    focus: (path: string, focus: string): Href =>
      mountedHref(path, focus) ?? {
        pathname: '/settings/[...page]',
        params: { page: path.split('/'), focus },
      },
    connections: (): Href => ({
      pathname: '/settings/[...page]',
      params: { page: ['connections'] },
    }),
    device: (deviceId: string, page?: 'remotes' | 'diagnostics'): Href =>
      page === undefined
        ? { pathname: '/device/[deviceId]/settings', params: { deviceId } }
        : { pathname: '/device/[deviceId]/settings/[page]', params: { deviceId, page } },
    cameras: (): Href => '/cameras/settings',
    talk: (): Href => '/talk/settings',
    talkChannel: (channelId: string): Href =>
      channelId === 'new'
        ? '/talk/settings/channels/new'
        : { pathname: '/talk/settings/channels/[channelId]', params: { channelId } },
    camera: (deviceId: string): Href => ({
      pathname: '/device/[deviceId]/settings/[page]',
      params: { deviceId, page: 'camera' },
    }),
    remoteViewing: (): Href => '/cameras/settings/remote-viewing',
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
  pairPhone: (): Href => '/pair-phone',
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
