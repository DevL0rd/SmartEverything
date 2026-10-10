import type { DeviceKind } from '@smarteverything/domain';
import type { Component } from './rest-schemas';

const KIND_BY_CATEGORY: ReadonlyMap<string, DeviceKind> = new Map<string, DeviceKind>([
  ['Light', 'light'],
  ['Switch', 'switch'],
  ['SmartPlug', 'plug'],
  ['AirPurifier', 'air_purifier'],
  ['Humidifier', 'humidifier'],
  ['Dehumidifier', 'dehumidifier'],
  ['AirConditioner', 'air_conditioner'],
  ['Fan', 'fan'],
  ['Thermostat', 'thermostat'],
  ['Camera', 'camera'],
  ['DoorBell', 'doorbell'],
  ['SmartLock', 'lock'],
  ['RobotCleaner', 'vacuum'],
  ['StickVacuumCleaner', 'vacuum'],
  ['Blind', 'cover'],
  ['Shade', 'cover'],
  ['GarageDoor', 'cover'],
  ['Television', 'television'],
  ['SmartMonitor', 'television'],
  ['Projector', 'television'],
  ['Speaker', 'speaker'],
  ['NetworkAudio', 'speaker'],
  ['HomeTheater', 'speaker'],
  ['Receiver', 'speaker'],
  ['IrRemote', 'ir_remote'],
  ['RemoteController', 'ir_remote'],
  ['Hub', 'gateway'],
  ['Bridges', 'gateway'],
  ['ContactSensor', 'sensor'],
  ['MotionSensor', 'sensor'],
  ['LeakSensor', 'sensor'],
  ['SmokeDetector', 'sensor'],
  ['TempSensor', 'sensor'],
  ['HumiditySensor', 'sensor'],
  ['TempHumiditySensor', 'sensor'],
  ['MultiFunctionalSensor', 'sensor'],
  ['PresenceSensor', 'sensor'],
  ['AirQualityDetector', 'sensor'],
  ['GenericSensor', 'sensor'],
  ['LightSensor', 'sensor'],
  ['SoundSensor', 'sensor'],
  ['Button', 'sensor'],
  ['Washer', 'appliance'],
  ['Dryer', 'appliance'],
  ['Dishwasher', 'appliance'],
  ['Refrigerator', 'appliance'],
  ['Oven', 'appliance'],
  ['Microwave', 'appliance'],
  ['Range', 'appliance'],
  ['Cooktop', 'appliance'],
  ['KitchenHood', 'appliance'],
  ['CoffeeMaker', 'appliance'],
  ['RiceCooker', 'appliance'],
  ['ClothingCareMachine', 'appliance'],
  ['WaterPurifier', 'appliance'],
  ['WaterHeater', 'heater'],
]);

function categoryNames(
  components: readonly Component[],
  type: 'user' | 'manufacturer',
): readonly string[] {
  return components.flatMap((component) =>
    component.categories
      .filter((category) => category.categoryType === type)
      .map((category) => category.name),
  );
}

export function deviceKindOf(components: readonly Component[]): DeviceKind {
  const names = [
    ...categoryNames(components, 'user'),
    ...categoryNames(components, 'manufacturer'),
  ];
  for (const name of names) {
    const kind = KIND_BY_CATEGORY.get(name);
    if (kind !== undefined) {
      return kind;
    }
  }
  return 'other';
}
