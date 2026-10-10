import type { MenuItem } from '../../../components/menu';
import type { Catalog } from '../data/use-automations';
import type { Choices } from '../model/blanks';
import type { ListChange } from '../model/editor-state';
import type { KindLook } from './kinds';

export function choicesOf(catalog: Catalog): Choices {
  return {
    devices: catalog.devices,
    sceneIds: catalog.scenes.map((scene) => scene.id),
    wakeProfileId: catalog.wakeProfileId,
  };
}

export function addItems<T extends string, I>(
  types: readonly T[],
  looks: Readonly<Record<T, KindLook>>,
  blank: (type: T) => I | null,
  apply: (change: ListChange<I>) => void,
): MenuItem[] {
  return types.flatMap((type) => {
    const item = blank(type);
    return item === null
      ? []
      : [
          {
            label: looks[type].label,
            icon: looks[type].icon,
            onPress: (): void => {
              apply({ kind: 'add', item });
            },
          },
        ];
  });
}
