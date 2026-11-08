import type { AppHref } from '../../../components/app-href';
import type { HarnessDiscoveryItem } from '@smarteverything/domain';

export function extensionHref(
  id: string,
  kind: 'extension' | 'skill',
  section?: 'devices' | 'source',
): AppHref {
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
): AppHref {
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', kind === 'skill' ? 'skills' : 'extensions', 'add'],
      ...(source === undefined ? {} : { source }),
    },
  };
}

export function bundledSkillHref(id: string): AppHref {
  return {
    pathname: '/settings/[...page]',
    params: { page: ['assistant', 'skills', 'detail'], skillId: id },
  };
}

export function discoveryHref(item: HarnessDiscoveryItem): AppHref {
  const {
    source: { url, ref, path },
    origin,
  } = item.reference;
  return {
    pathname: '/settings/[...page]',
    params: {
      page: ['assistant', item.kind === 'skill' ? 'skills' : 'extensions', 'detail'],
      discoveryId: item.id,
      source: url,
      ...(ref === undefined ? {} : { sourceRef: ref }),
      ...(path === undefined ? {} : { sourcePath: path }),
      ...(origin === undefined
        ? {}
        : {
            originUrl: origin.url,
            ...(origin.ref === null ? {} : { originRef: origin.ref }),
            ...(origin.path === null ? {} : { originPath: origin.path }),
          }),
    },
  };
}
