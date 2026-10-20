import { builtinV11Templates } from './builtin-v11-templates';
import { computerTemplates, type ComputerFeatures } from './computer-templates';
import { deviceTemplates } from './device-templates';
import { homeTemplates } from './home-templates';
import { learnTemplates } from './learn-templates';
import { signalTemplates } from './signal-templates';
import type { Template, TemplateDevice, TemplateRoom } from './parameters';

export interface TemplateHome {
  readonly rooms?: readonly TemplateRoom[];
  readonly people?: readonly TemplateRoom[];
  readonly computerFeatures?: ComputerFeatures;
}

export function templatesFor(
  devices: readonly TemplateDevice[],
  home: TemplateHome = {},
): Template[] {
  return [
    ...homeTemplates(devices, home.rooms ?? []),
    ...deviceTemplates(devices),
    ...computerTemplates(devices, home.computerFeatures ?? new Map()),
    ...learnTemplates(devices),
    ...signalTemplates(devices),
    ...builtinV11Templates(devices, home.people ?? []),
  ];
}
