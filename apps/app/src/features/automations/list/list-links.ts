import type { AppHref } from '../../../components/app-href';

export interface ListLinks {
  readonly open: (automationId: string) => AppHref;
  readonly edit: (automationId: string) => AppHref;
  readonly runs: (automationId: string) => AppHref;
}
