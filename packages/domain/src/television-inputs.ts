import { humanizeEnum } from './presentation/humanize';

export const INPUT_LABELS: Readonly<Record<string, string>> = {
  dtv: 'TV',
  digitalTv: 'TV',
  HDMI: 'HDMI',
  HDMI1: 'HDMI 1',
  HDMI2: 'HDMI 2',
  HDMI3: 'HDMI 3',
  HDMI4: 'HDMI 4',
  HDMI5: 'HDMI 5',
  HDMI6: 'HDMI 6',
  USB: 'USB',
  aux: 'AUX',
  wifi: 'Wi-Fi',
};

export function inputLabel(id: string): string {
  return INPUT_LABELS[id] ?? humanizeEnum(id);
}
