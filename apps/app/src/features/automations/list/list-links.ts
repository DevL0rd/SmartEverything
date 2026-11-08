import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';

export interface WorkspaceLink {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly href: AppHref;
}

export interface ListLinks {
  readonly open: (automationId: string) => AppHref;
  readonly edit: (automationId: string) => AppHref;
  readonly runs: (automationId: string) => AppHref;
  readonly workspace: readonly WorkspaceLink[];
  readonly extras: readonly WorkspaceLink[];
}
