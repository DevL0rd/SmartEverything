import type { Href } from 'expo-router';
import type { IconName } from '../../../components/icon';

export interface WorkspaceLink {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly href: Href;
}

export interface ListLinks {
  readonly open: (automationId: string) => Href;
  readonly edit: (automationId: string) => Href;
  readonly runs: (automationId: string) => Href;
  readonly workspace: readonly WorkspaceLink[];
  readonly extras: readonly WorkspaceLink[];
}
