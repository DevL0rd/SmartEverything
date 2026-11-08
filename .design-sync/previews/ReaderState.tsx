import type { ReactElement } from 'react';
import { ReaderState, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const none = (): void => undefined;
const body = (
  <Col gap={24}>
    <ReaderState error={null} loading={false} empty missingAnchor={false} words="" retry={none} />
    <ReaderState
      error={null}
      loading={false}
      empty
      missingAnchor={false}
      words="garage"
      retry={none}
    />
    <ReaderState
      error={new Error('The hub did not answer in time')}
      loading={false}
      empty={false}
      missingAnchor={false}
      words=""
      retry={none}
    />
  </Col>
);
export const States = (): ReactElement => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
