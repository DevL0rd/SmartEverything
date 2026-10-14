import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
const PANEL_HEIGHT_MAX = 320;
const PANEL_MARGIN = 8;
export function SuggestionPanel({
  children,
  inline = false,
}: {
  readonly children: ReactNode;
  readonly inline?: boolean;
}): ReactNode {
  const anchor = useRef<View>(null);
  const { height } = useWindowDimensions();
  const [room, setRoom] = useState(PANEL_HEIGHT_MAX);
  const measure = (): void => {
    anchor.current?.measureInWindow((_x, y) => {
      setRoom(Math.max(0, y - PANEL_MARGIN));
    });
  };
  useEffect(measure, [height]);
  const frame = { maxHeight: inline ? PANEL_HEIGHT_MAX : Math.min(PANEL_HEIGHT_MAX, room) };
  return (
    <View className={inline ? 'mb-2' : 'absolute bottom-full left-0 right-0 mb-2'}>
      <View ref={anchor} onLayout={measure} className="absolute bottom-0 h-0 w-full" />
      <View
        style={frame}
        className="overflow-hidden rounded-xl border-hairline border-outline-variant bg-surface-raised elevation-2"
      >
        {children}
      </View>
    </View>
  );
}
