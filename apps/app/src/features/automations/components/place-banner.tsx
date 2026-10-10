import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { PlaceStatus } from '../model/place-status';

const LOCATION = 'home/location';

export function PlaceBanner({ status }: { readonly status: PlaceStatus }): ReactNode {
  const fix = { label: 'Fix', href: href.settings.page(LOCATION) };
  switch (status.kind) {
    case 'ok':
      return null;
    case 'invalid':
      return <Banner tone="critical" title="Your home’s time zone isn’t valid" action={fix} />;
    case 'zone-differs':
      return (
        <Banner
          tone="warning"
          title="Set your home’s time zone"
          body={`It’s ${status.home}, you’re on ${status.device}.`}
          action={fix}
        />
      );
    case 'no-location':
      return (
        <Banner
          tone="warning"
          title="Add your home’s location"
          body="Sunrise, sunset and weather need it."
          action={fix}
        />
      );
  }
}
