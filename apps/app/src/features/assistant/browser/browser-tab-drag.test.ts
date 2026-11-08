import type { ScrollView } from 'react-native';
import { expect, it, vi } from 'vitest';
import { TabDrag } from './browser-tab-drag';

it('reveals the selected browser tab when the dock narrows', () => {
  const drag = new TabDrag();
  const scrollTo = vi.fn<ScrollView['scrollTo']>();
  drag.configure(['first', 'second', 'third', 'fourth'], { width: 174, rtl: false }, vi.fn());
  drag.attach({ scrollTo });

  drag.measure(1400, 0, 'fourth');
  expect(scrollTo).not.toHaveBeenCalled();
  drag.measure(400, 0, 'fourth');
  drag.measure(400, 10, 'fourth');
  drag.measure(0, 0, 'fourth');
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ x: 296, animated: false });
});
