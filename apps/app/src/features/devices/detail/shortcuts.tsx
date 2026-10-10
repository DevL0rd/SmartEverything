import type { ReactNode } from 'react';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { controlCount } from '../model/control-groups';
import { useDeviceModel } from '../model/device-model';
import { sectionHref, sectionsOf } from './sections';

export function Shortcuts({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const count = controlCount(model.presentation);
  return (
    <List>
      {sectionsOf(model).flatMap((section) =>
        section.key === 'overview'
          ? []
          : [
              <NavRow
                key={section.key}
                title={section.title}
                icon={section.icon}
                href={sectionHref(device.id, section.key)}
                {...(section.key === 'controls' ? { value: String(count) } : {})}
              />,
            ],
      )}
    </List>
  );
}
