import { Skeleton, Stage } from 'smarteverything-kit';
import { Col, Row } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <Row gap={12}>
      <Skeleton shape="circle" />
      <div style={{ width: 220 }}>
        <Col gap={8}>
          <Skeleton shape="text" />
          <Skeleton shape="line" />
        </Col>
      </div>
    </Row>
    <div style={{ width: 320 }}>
      <Skeleton shape="tile" />
    </div>
    <div style={{ width: 320 }}>
      <Skeleton shape="block" />
    </div>
  </Col>
);
export const Shapes = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
