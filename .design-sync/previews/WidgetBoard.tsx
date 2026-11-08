import type { ReactElement } from 'react';
import { Stage } from 'smarteverything-kit';
import { BoardDemo } from '../board-demo';

export const Viewing = (): ReactElement => (
  <Stage theme="dark" width={860}>
    <BoardDemo />
  </Stage>
);
export const Editing = (): ReactElement => (
  <Stage theme="dark" width={860}>
    <BoardDemo editing />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={860}>
    <BoardDemo />
  </Stage>
);
