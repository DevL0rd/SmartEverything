import type { DeviceFamily } from '@smarteverything/domain';
import { WatchCard } from '../../watches';
import { ButtonCard } from '../button/card';
import { GatewayCard } from '../button/gateway-card';
import { RelayCard } from '../button/relay-card';
import { DiffuserCard } from '../diffuser/card';
import { LaundryFace } from '../laundry/faces';
import { MicrowaveCard } from '../microwave/card';
import { BlasterCard } from '../remote/blaster-card';
import { TelevisionFace } from '../television/faces';
import { ScaleCard } from '../scale/card';
import { ContactSensorCard } from '../sensors/contact-card';
import { HumidifierCard } from '../sensors/humidifier-card';
import { PurifierCard } from '../sensors/purifier-card';
import type { CardFace } from './card-face';
import { LightCardFace } from './light-card-face';

export const FAMILY_CARDS: Readonly<Partial<Record<DeviceFamily, CardFace>>> = {
  light: LightCardFace,
  laundry: LaundryFace,
  button: ButtonCard,
  gateway: GatewayCard,
  switch: RelayCard,
  plug: RelayCard,
  scale: ScaleCard,
  wearable: WatchCard,
  diffuser: DiffuserCard,
  ir_blaster: BlasterCard,
  ir_remote: BlasterCard,
  sensor: ContactSensorCard,
  air_purifier: PurifierCard,
  humidifier: HumidifierCard,
  microwave: MicrowaveCard,
  television: TelevisionFace,
};
