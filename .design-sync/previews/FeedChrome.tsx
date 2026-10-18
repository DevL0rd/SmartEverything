import { FeedChrome, Stage } from 'smarteverything-kit';

const none = () => undefined;
export const Feed = () => (
  <Stage theme="dark" width={560}>
    <FeedChrome
      words=""
      changeWords={none}
      context={false}
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      focusSearch={false}
    />
  </Stage>
);
export const Context = () => (
  <Stage theme="dark" width={560}>
    <FeedChrome
      words="lights"
      changeWords={none}
      context
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      focusSearch={false}
    />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={560}>
    <FeedChrome
      words=""
      changeWords={none}
      context={false}
      missingAnchor={false}
      back={none}
      latest={none}
      controls={null}
      focusSearch={false}
    />
  </Stage>
);
