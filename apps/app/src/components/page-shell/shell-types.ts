import type { ReactNode } from 'react';
import type { Crumb } from '../breadcrumbs';
import type { MenuItem } from '../menu';
import type { PageSettingsLink } from '../page-menu';
import type { PrimaryActionProps } from '../primary-action';
import type { ShellSearchConfig } from './search-slot';
import type { ShellAction, ShellEditing } from './shell-actions';
import type { ShellSections, ShellTabs } from './shell-sections';

export interface ShellAside {
  readonly label: string;
  readonly open: boolean;
  readonly width: number;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export type ShellVariant = 'page' | 'overlay' | 'pane';

export interface StandardShellProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly back?: boolean;
  readonly actions?: readonly ShellAction[];
  readonly overflow?: readonly MenuItem[];
  readonly settings?: PageSettingsLink;
  readonly primaryAction?: PrimaryActionProps;
  readonly editing?: ShellEditing | null;
  readonly selection?: ReactNode;
  readonly search?: ShellSearchConfig;
  readonly tabs?: ShellTabs;
  readonly toolbar?: ReactNode;
  readonly controls?: ReactNode;
  readonly sections?: ShellSections;
  readonly aside?: ShellAside;
  readonly banner?: ReactNode;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  readonly variant?: 'page';
  readonly children: ReactNode;
}

export interface VariantShellProps {
  readonly variant: Exclude<ShellVariant, 'page'>;
  readonly title: string;
  readonly bare?: boolean;
  readonly heading?: ReactNode;
  readonly back?: boolean;
  readonly onBack?: () => void;
  readonly leading?: readonly ShellAction[];
  readonly trailing?: ReactNode;
  readonly banner?: ReactNode;
  readonly actions?: readonly ShellAction[];
  readonly overflow?: readonly MenuItem[];
  readonly settings?: PageSettingsLink;
  readonly primaryAction?: PrimaryActionProps;
  readonly editing?: ShellEditing | null;
  readonly search?: ShellSearchConfig;
  readonly toolbar?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

export type PageShellProps = StandardShellProps | VariantShellProps;

export function isVariantShell(shell: PageShellProps): shell is VariantShellProps {
  return shell.variant === 'overlay' || shell.variant === 'pane';
}
