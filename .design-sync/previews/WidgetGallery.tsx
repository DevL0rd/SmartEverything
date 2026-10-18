import { GlobalTheme, Stage, WidgetGallery } from 'smarteverything-kit';
import { catalogue } from '../board-demo';

const cell = { width: 70, height: 80, gap: 12 };
const gallery = (
  <WidgetGallery
    open
    onClose={() => undefined}
    definitions={catalogue as never}
    board="expanded"
    cell={cell}
    onAdd={() => undefined}
  />
);
export const Dark = () => <Stage theme="dark">{gallery}</Stage>;
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">{gallery}</Stage>
  </GlobalTheme>
);
