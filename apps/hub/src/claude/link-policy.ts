import type { ComputerAiSettings } from '@smarteverything/domain';

export function linkWanted(settings: ComputerAiSettings): boolean {
  return settings.control.enabled && settings.control.auto_link;
}
