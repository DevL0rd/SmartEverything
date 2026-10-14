import type { Href } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';
import type { IconName } from '../components/icon';
import type { Availability } from '../store/selectors';

export type TabKey =
  'home' | 'devices' | 'cameras' | 'fitness' | 'assistant' | 'automations' | 'talk' | 'settings';

export interface PreloadContext {
  readonly queryClient: QueryClient;
}

export interface RouteAction {
  readonly key: string;
  readonly title: string;
  readonly icon: IconName;
  readonly href: Href;
  readonly keywords: readonly string[];
  readonly ownerOnly?: boolean;
}

export interface RouteDefinition {
  readonly key: string;
  readonly href: Href;
  readonly title: string;
  readonly shortTitle?: string;
  readonly icon: IconName;
  readonly tab: TabKey;
  readonly parent: string | null;
  readonly keywords: readonly string[];
  readonly available: (availability: Availability) => boolean;
  readonly badge?: (availability: Availability) => 'critical' | null;
  readonly preload?: (context: PreloadContext) => Promise<void>;
  readonly searchable: boolean;
  readonly actions?: readonly RouteAction[];
}
