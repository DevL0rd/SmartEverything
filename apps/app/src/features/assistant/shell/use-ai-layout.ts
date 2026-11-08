import { useWindowDimensions } from 'react-native';
import { useSizeClass } from '../../../design/size-class';
import { useLocalPref } from '../../../store/local-prefs';
import { DOCK_DEFAULT, aiLayout, type AiLayout } from '../model/ai-layout';

export function useAiLayout(): AiLayout {
  const { width, height } = useWindowDimensions();
  const { idiom, nav } = useSizeClass();
  const sidebarCollapsed = useLocalPref('sidebarCollapsed');
  const listOpen = useLocalPref('chatListOpen');
  return aiLayout({
    windowWidth: width,
    windowHeight: height,
    idiom,
    nav,
    sidebarCollapsed: sidebarCollapsed && idiom === 'pointer',
    listOpen,
    dockOpen: false,
    dockWidth: DOCK_DEFAULT,
  });
}
