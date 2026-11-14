import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Banner, type BannerProps } from '../../../components/banner';
import { useDriveRescan } from '../data';
import { driveBannerOf, type DriveBannerAction, type DriveBannerInput } from './banner-model';

type BannerAction = NonNullable<BannerProps['action']>;

function useBannerAction(
  action: DriveBannerAction | null,
  rootId: string | null,
): BannerAction | undefined {
  const rescan = useDriveRescan();
  if (action === 'storage') return { label: 'Open Storage', href: href.drivePage('storage') };
  if (action !== 'rescan' || rootId === null) return undefined;
  return {
    label: 'Rescan',
    icon: 'refresh',
    loading: rescan.busy,
    onPress: (): void => {
      rescan.run(rootId);
    },
  };
}

export function useDriveBanner(input: DriveBannerInput): ReactNode | undefined {
  const model = driveBannerOf(input);
  const action = useBannerAction(model?.action ?? null, input.root?.id ?? null);
  if (model === null) return undefined;
  return (
    <Banner
      wrapBody
      key={model.key}
      tone={model.tone}
      title={model.title}
      body={model.body}
      {...(action === undefined ? {} : { action })}
    />
  );
}
