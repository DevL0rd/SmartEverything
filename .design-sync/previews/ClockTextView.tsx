import type { ReactNode } from 'react';
import { ClockText, Stage, Text } from 'smarteverything-kit';
import { Col, Row } from '../preview-helpers';

const at = '2026-10-14T18:30:00Z';
const body = (
  <Col gap={8}>
    <Row>
      <Text tone="variant">New York</Text>
      <ClockText at={at} timeZone="America/New_York" variant="title-2" />
    </Row>
    <Row>
      <Text tone="variant">London</Text>
      <ClockText at={at} timeZone="Europe/London" variant="title-2" />
    </Row>
    <Row>
      <Text tone="variant">Tokyo</Text>
      <ClockText at={at} timeZone="Asia/Tokyo" variant="body" tone="primary" />
    </Row>
  </Col>
);
export const Zones = (): ReactNode => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
