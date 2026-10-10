import type { CallAudioPref, EchoTestOutcome } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { runAssistantEchoTest } from '../../../../../../modules/health-connect';

const log = new Logger('app.assistant-call');

export async function measureNativeEcho(pref: CallAudioPref): Promise<EchoTestOutcome> {
  const microphone = await requestRecordingPermissionsAsync();
  if (!microphone.granted) {
    log.warn('call.echo_test_unavailable', { reason: 'microphone not allowed' });
    return 'failed';
  }
  const report = await runAssistantEchoTest();
  log.info('call.echo_test', { ...report, echo: pref.echo, output: pref.output });
  return report.outcome;
}
