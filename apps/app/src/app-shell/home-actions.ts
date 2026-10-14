import type { Href } from 'expo-router';
import type { IconName } from '../components/icon';
import { href } from './hrefs';

export interface HomeAction {
  readonly label: string;
  readonly icon: IconName;
  readonly href: Href;
}

export const HOME_ACTIONS: readonly HomeAction[] = [
  {
    label: 'People & devices',
    icon: 'users',
    href: href.settings.page('members'),
  },
  { label: 'About', icon: 'info', href: href.settings.page('about') },
];

export const CONNECTIONS_ACTION: HomeAction = {
  label: 'Connections',
  icon: 'link',
  href: href.settings.connections(),
};
