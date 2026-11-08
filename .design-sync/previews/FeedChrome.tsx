import type { ReactNode } from 'react';
import { FeedChrome, Stage } from 'smarteverything-kit';

const none = (): void => undefined;
export const Feed = (): ReactNode => (
  <Stage theme="dark" width={560}>
    <FeedChrome
      words=""
      changeWords={none}
      context={false}
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      inlineControls={false}
      focusSearch={false}
    />
  </Stage>
);
export const Context = (): ReactNode => (
  <Stage theme="dark" width={560}>
    <FeedChrome
      words="lights"
      changeWords={none}
      context
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      inlineControls={false}
      focusSearch={false}
    />
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={560}>
    <FeedChrome
      words=""
      changeWords={none}
      context={false}
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      inlineControls={false}
      focusSearch={false}
    />
  </Stage>
);
