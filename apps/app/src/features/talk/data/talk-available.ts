import { talkLinked } from '../../../../modules/health-connect';
import { appPlatform } from '../../../design/platform';

export function talkAvailable(): boolean {
  return appPlatform() !== 'android' || talkLinked();
}
