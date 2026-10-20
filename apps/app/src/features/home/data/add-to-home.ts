import { useRouter } from 'expo-router';
import { readBoardLayout, BOARD_LAYOUT_VERSION, type BoardLayout } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import type { BoardWidget } from '../../../components/widget-board';
import { useSavePageLayout } from '../../../store/layouts';
import { useEntityStore } from '../../../store/store-context';
import { selectCameraEntries } from '../../cameras';
import { selectLightGroupDefaults } from '../../device-groups';
import { withWidgetAdded } from '../model/add-widget';
import { deviceDigest } from '../model/spotlight';
import { HOME_PAGE, homeDefaults } from '../model/defaults';

const log = new Logger('app.home');

const NO_LAYOUT: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: {} };

export function useAddToHome(): (widget: BoardWidget) => void {
  const store = useEntityStore();
  const router = useRouter();
  const save = useSavePageLayout(HOME_PAGE);
  return (widget): void => {
    const state = store.get();
    const read = readBoardLayout(state.tables.layouts.byId[HOME_PAGE]?.layout ?? null);
    if (read.status === 'invalid') {
      notify({ message: 'Home was not changed', detail: read.reason, tone: 'critical' });
      return;
    }
    const defaults = homeDefaults(
      deviceDigest(state),
      selectCameraEntries(state),
      selectLightGroupDefaults(state),
    );
    const next = withWidgetAdded(
      read.status === 'stored' ? read.layout : NO_LAYOUT,
      defaults,
      widget,
    );
    log.info('home.widget_add_requested', {
      key: widget.key,
      type: widget.type,
      added: next !== null,
    });
    if (next !== null) save(next);
    router.navigate(href.home({ reveal: widget.key }));
  };
}
