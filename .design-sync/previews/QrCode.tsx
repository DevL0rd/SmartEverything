import type { ReactElement } from 'react';
import { QrCode, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={24}>
    <QrCode text="https://hub.home.example/pair?code=482913" size={160} label="Pairing QR code" />
    <QrCode text="WIFI:S:HomeNet;T:WPA;P:correct-horse;;" size={110} label="Wi-Fi QR code" />
  </Row>
);
export const Codes = (): ReactElement => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
