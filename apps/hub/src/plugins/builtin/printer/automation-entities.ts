import { entity } from '../automation-kit';
import { JOB_PICKER, PRINTER_PICKER } from './pickers';

const PLUGIN = 'printer';

export const PRINTER = entity(PLUGIN, {
  id: 'printer',
  title: 'Printer',
  plural: 'Printers',
  options: PRINTER_PICKER,
});

export const JOB = entity(PLUGIN, {
  id: 'job',
  title: 'Print job',
  plural: 'Print jobs',
  options: JOB_PICKER,
});
