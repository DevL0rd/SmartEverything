import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Interactive } from '../../components/interactive';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetSurface,
  type WidgetDefinition,
} from '../../components/widget-board';
import { allSizes } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { PhoneFace } from './card/phone-face';
import { useMyPhone } from './this-phone-device';

function PhoneWidget(): ReactNode {
  const phone = useMyPhone();
  const { cls } = useWidgetFace();
  if (phone === null) {
    return (
      <WidgetFrame title="Phone" icon="smartphone" accent="primary">
        <WidgetEmpty
          icon="smartphone"
          colour="primary"
          title="Share your phone"
          body="See its battery, what you’re doing and ring it from here."
          action={{ label: 'Set up', href: href.settings.page('this-phone') }}
        />
      </WidgetFrame>
    );
  }
  return (
    <WidgetSurface className="p-card-pad">
      <Interactive
        label={phone.label}
        href={href.device(phone)}
        className="absolute inset-0"
        layerClassName="rounded-lg"
      >
        {null}
      </Interactive>
      <View className="flex-1" pointerEvents="box-none">
        <PhoneFace device={phone} cls={cls} />
      </View>
    </WidgetSurface>
  );
}

export const PHONE_WIDGET: WidgetDefinition = {
  type: 'phone',
  title: 'Phone',
  icon: 'smartphone',
  sizes: allSizes('M', 'W', 'XL'),
  defaultSize: 'M',
  render: () => <PhoneWidget />,
};
