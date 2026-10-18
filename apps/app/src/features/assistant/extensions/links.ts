import type { Href } from 'expo-router';
import type { HarnessDiscoveryItem } from '@smarteverything/domain';

export function extensionHref(
  id: string,
  kind: 'extension' | 'skill',
  section?: 'devices' | 'source',
): Href {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', kind === 'skill' ? 'skills' : 'extensions', 'detail'],
      extensionId: id,
      ...(section === undefined ? {} : { section }),
    },
  };
}

export function extensionBrowseHref(
  kind: 'extension' | 'skill' = 'extension',
  source?: string,
): Href {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', kind === 'skill' ? 'skills' : 'extensions', 'add'],
      ...(source === undefined ? {} : { source }),
    },
  };
}

export function bundledSkillHref(id: string): Href {
  return {
    pathname: '/settings/[...page]',
    params: { page: ['assistant', 'skills', 'detail'], skillId: id },
  };
}

export function discoveryHref(item: HarnessDiscoveryItem, source?: string): Href {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', item.kind === 'skill' ? 'skills' : 'extensions', 'detail'],
      discoveryId: item.id,
      ...(source === undefined ? {} : { source }),
    },
  };
}
