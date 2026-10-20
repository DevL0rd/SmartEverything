import { FAMILY_ICONS } from './family-icon';
import type { VisualRegistry } from './types';
import { BottleVisual } from './visuals/bottle-visual';
import { ButtonVisual } from './visuals/button-visual';
import { CameraVisual } from './visuals/camera-visual';
import { CoverVisual } from './visuals/cover-visual';
import { MicrowaveVisual } from './visuals/microwave-visual';
import { DiffuserVisual } from './visuals/diffuser-visual';
import { glyphVisual } from './visuals/glyph-visual';
import { HubVisual } from './visuals/hub-visual';
import { DehumidifierVisual, HumidifierVisual } from './visuals/humidifier-visual';
import { LaundryVisual } from './visuals/laundry-visual';
import { LightVisual } from './visuals/light-visual';
import { LockVisual } from './visuals/lock-visual';
import { IrBlasterVisual, IrRemoteVisual } from './visuals/ir-visual';
import { SpeakerVisual } from './visuals/media-visual';
import { PhoneVisual } from './visuals/phone-visual';
import { PrinterVisual } from './visuals/printer-visual';
import { PurifierVisual } from './visuals/purifier-visual';
import { RobotVisual } from './visuals/robot-visual';
import { RotorFanVisual } from './visuals/rotor-fan-visual';
import { ScaleVisual } from './visuals/scale-visual';
import { SensorVisual } from './visuals/sensor-visual';
import { PlugVisual, SwitchVisual } from './visuals/socket-visual';
import { AirConditionerVisual, HeaterVisual, ThermostatVisual } from './visuals/thermal-visual';
import { TelevisionVisual } from './visuals/television-visual';
import { ToothbrushVisual } from './visuals/toothbrush-visual';
import { TreadmillVisual } from './visuals/treadmill-visual';
import { TowerFanVisual } from './visuals/tower-fan-visual';
import { VacuumVisual } from './visuals/vacuum-visual';
import { WatchVisual } from './visuals/watch-visual';

export const VISUALS: VisualRegistry = {
  air_purifier: PurifierVisual,
  humidifier: HumidifierVisual,
  diffuser: DiffuserVisual,
  microwave: MicrowaveVisual,
  laundry: LaundryVisual,
  dehumidifier: DehumidifierVisual,
  tower_fan: TowerFanVisual,
  fan: RotorFanVisual,
  heater: HeaterVisual,
  air_conditioner: AirConditionerVisual,
  thermostat: ThermostatVisual,
  light: LightVisual,
  switch: SwitchVisual,
  plug: PlugVisual,
  sensor: SensorVisual,
  button: ButtonVisual,
  camera: CameraVisual,
  doorbell: glyphVisual(FAMILY_ICONS.doorbell),
  scale: ScaleVisual,
  wearable: WatchVisual,
  television: TelevisionVisual,
  speaker: SpeakerVisual,
  lock: LockVisual,
  cover: CoverVisual,
  vacuum: VacuumVisual,
  ir_blaster: IrBlasterVisual,
  ir_remote: IrRemoteVisual,
  gateway: HubVisual,
  router: glyphVisual(FAMILY_ICONS.router),
  file_sync: glyphVisual(FAMILY_ICONS.file_sync),
  dns_filter: glyphVisual(FAMILY_ICONS.dns_filter),
  robot: RobotVisual,
  treadmill: TreadmillVisual,
  printer: PrinterVisual,
  bottle: BottleVisual,
  toothbrush: ToothbrushVisual,
  computer: glyphVisual(FAMILY_ICONS.computer),
  phone: PhoneVisual,
  generic: glyphVisual(FAMILY_ICONS.generic),
};
