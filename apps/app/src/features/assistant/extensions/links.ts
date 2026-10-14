import type { Href } from 'expo-router';
import type { HarnessDiscoveryItem } from '@smarteverything/domain';

export function extensionHref(
  id: string,
  section?: 'devices' | 'source',
  inspected?: boolean,
): Href {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', id.startsWith('skill-asset:') ? 'skills' : 'extensions', 'detail'],
      extensionId: id,
      ...(section === undefined ? {} : { section }),
      ...(inspected === true ? { inspect: 'true' } : {}),
    },
  };
}

export function extensionBrowseHref(kind: 'extension' | 'skill' = 'extension'): Href {
  return {
    pathname: '/settings/[...page]',
    params: { page: ['assistant', kind === 'skill' ? 'skills' : 'extensions', 'add'] },
  };
}

export function bundledSkillHref(id: string): Href {
  return {
    pathname: '/settings/[...page]',
    params: { page: ['assistant', 'skills', 'detail'], skillId: id },
  };
}

export function discoveryHref(item: HarnessDiscoveryItem): Href {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', item.kind === 'skill' ? 'skills' : 'extensions', 'detail'],
      discoveryId: item.id,
    },
  };
}
