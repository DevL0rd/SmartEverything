import type { BoardClass, BoardLayout } from '@smarteverything/domain';
import {
  boardClassOf,
  withoutRetired,
  type BoardLayoutState,
} from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { useLightGroupDefaults } from '../../device-groups';
import type { BoardDefaults } from '../../../components/widget-board';
import { HOME_PAGE, HOME_RETIRED, homeDefaults } from '../model/defaults';
import { useHomeBasics } from './home-data';

export interface HomeLayoutSizes {
  readonly state: BoardLayoutState;
  readonly defaults: BoardDefaults;
  readonly current: BoardClass;
  readonly save: (layout: BoardLayout) => void;
}

export function useHomeLayoutSizes(): HomeLayoutSizes {
  const { digest, cameras } = useHomeBasics();
  const lightGroups = useLightGroupDefaults();
  return {
    state: withoutRetired(usePageLayout(HOME_PAGE), HOME_RETIRED),
    defaults: homeDefaults(digest, cameras, lightGroups),
    current: boardClassOf(useSizeClass().width),
    save: useSavePageLayout(HOME_PAGE),
  };
}
