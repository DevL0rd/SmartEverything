import { WIDGET_SIZES, type BoardClass, type WidgetSize } from '@smarteverything/domain';
import type { WidgetDefinition } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import type { DeviceSection } from './device-filter';

export function selectedFillDevice(
  groups: readonly DeviceSection[],
  deviceId: string | null,
): Device | null {
  if (deviceId === null) return null;
  const lone = groups.length === 1 ? groups[0] : undefined;
  if (lone?.lights !== null || lone.devices.length !== 1) return null;
  const device = lone.devices[0];
  return device?.id === deviceId ? device : null;
}

export function fillSizeOf(
  definition: Pick<WidgetDefinition, 'sizes' | 'defaultSize'>,
  board: BoardClass,
): WidgetSize {
  const offered = definition.sizes[board];
  return WIDGET_SIZES.findLast((size) => offered.includes(size)) ?? definition.defaultSize;
}
