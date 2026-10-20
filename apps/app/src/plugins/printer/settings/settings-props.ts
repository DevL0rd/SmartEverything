import type { PrinterSettingsView } from '@smarteverything/domain';
import type { PrinterActor } from '../data/use-printer-view';
import type { Device } from '../../../store/state';

export interface SettingsProps {
  readonly device: Device;
  readonly settings: PrinterSettingsView;
  readonly actor: PrinterActor;
  readonly owner: boolean;
}
