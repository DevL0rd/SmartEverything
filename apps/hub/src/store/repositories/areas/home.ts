import type { Logger } from '@smarteverything/logging';
import type { StoreContext } from '../../context';
import { BleObservationsRepository } from '../ble-observations';
import { BottleLogsRepository } from '../bottle-logs';
import { BrushingSessionsRepository } from '../brushing-sessions';
import { BottleReadingsRepository } from '../bottle-readings';
import { CamerasRepository } from '../cameras';
import { CommandsRepository } from '../commands';
import { DeviceEffectsRepository } from '../device-effects';
import { DeviceGroupsRepository } from '../device-groups';
import { DeviceMetricsRepository } from '../device-metrics';
import { DevicesRepository } from '../devices';
import { EventsRepository } from '../events';
import { InfraredRepository } from '../infrared';
import { LocalDevicesRepository } from '../local-devices';
import { PhoneContextsRepository } from '../phone-contexts';
import { PhoneDetailsRepository } from '../phone-details';
import { PhoneIconsRepository } from '../phone-icons';
import { RoomsRepository } from '../rooms';
import { ScenesRepository } from '../scenes';
import { StateRepository } from '../state';
import { TelevisionSettingsRepository } from '../television-settings';
import { TreadmillSessionsRepository } from '../treadmill-sessions';

export const homeRepositories = (context: StoreContext, log: Logger) =>
  ({
    rooms: new RoomsRepository(context),
    deviceGroups: new DeviceGroupsRepository(context),
    devices: new DevicesRepository(context),
    state: new StateRepository(context),
    deviceMetrics: new DeviceMetricsRepository(context),
    commands: new CommandsRepository(context),
    deviceEffects: new DeviceEffectsRepository(context),
    events: new EventsRepository(context),
    cameras: new CamerasRepository(context),
    infrared: new InfraredRepository(context),
    scenes: new ScenesRepository(context),
    localDevices: new LocalDevicesRepository(context),
    bleObservations: new BleObservationsRepository(context),
    phoneContexts: new PhoneContextsRepository(context),
    phoneDetails: new PhoneDetailsRepository(context, log),
    phoneIcons: new PhoneIconsRepository(context),
    televisionSettings: new TelevisionSettingsRepository(context),
    treadmillSessions: new TreadmillSessionsRepository(context),
    bottleReadings: new BottleReadingsRepository(context),
    bottleLogs: new BottleLogsRepository(context),
    brushingSessions: new BrushingSessionsRepository(context),
  }) as const;
