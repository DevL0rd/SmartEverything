import type { PrinterDetails } from '@smarteverything/domain';

export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

function present(label: string, value: string | null): readonly DetailRow[] {
  return value === null || value === '' ? [] : [{ label, value }];
}

export function uptimeLabel(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${String(days)} d ${String(hours)} h`;
  return hours > 0 ? `${String(hours)} h ${String(minutes)} min` : `${String(minutes)} min`;
}

export function detailRows(details: PrinterDetails): readonly DetailRow[] {
  return [
    ...present('Address', details.uri),
    ...present('Location', details.location),
    ...present('Serial number', details.serial),
    ...present('Firmware', details.firmware),
    ...present('Printer ID', details.uuid),
    ...present('Speed', details.ppm === null ? null : `${String(details.ppm)} pages a minute`),
    ...present(
      'Colour speed',
      details.ppmColour === null ? null : `${String(details.ppmColour)} pages a minute`,
    ),
    ...present(
      'Sign-in',
      details.authentication.length === 0 ? null : details.authentication.join(', '),
    ),
    ...present('IPP versions', details.versions.join(', ')),
    ...present(
      'Resolutions',
      details.resolutions.length === 0
        ? null
        : details.resolutions.map((value) => `${String(value)} dpi`).join(', '),
    ),
    ...present('Accepts', details.formats.join(', ')),
    ...present('Wi-Fi', details.wifiSsid),
    ...present('Printer page', details.adminUrl),
  ];
}
