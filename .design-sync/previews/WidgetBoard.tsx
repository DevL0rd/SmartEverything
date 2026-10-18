import { Stage } from 'smarteverything-kit';
import { BoardDemo } from '../board-demo';

export const Viewing = () => (
  <Stage theme="dark" width={860}>
    <BoardDemo />
  </Stage>
);
export const Editing = () => (
  <Stage theme="dark" width={860}>
    <BoardDemo editing />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={860}>
    <BoardDemo />
  </Stage>
);
