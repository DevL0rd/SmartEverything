import { Logger } from '@smarteverything/logging';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_HARNESS_COMMAND_ENDPOINTS as E,
  type AiHarnessCommandWrite,
  type AiHarnessCommandOutcome,
} from '@smarteverything/domain';
import type { AssistantWriteScope } from '../../../store/assistant-response-style';
const log = new Logger('app.assistant');
export async function executeCommand(
  chatId: string,
  scopeKey: string,
  body: AiHarnessCommandWrite,
  authority: AssistantWriteScope,
): Promise<AiHarnessCommandOutcome> {
  const client = authority.client;
  const key = `smarteverything.command.${body.operation_id}`;
  const payloadHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(body));
  const identity = {
    chatId,
    scopeKey,
    session_id: body.session_id,
    expected_epoch: body.expected_epoch,
    operation_id: body.operation_id,
    payloadHash,
  };
  await AsyncStorage.setItem(key, JSON.stringify({ ...identity, status: 'pending' }));
  if (!authority.current()) {
    await AsyncStorage.removeItem(key);
    return {
      status: 'rejected',
      message: 'Command not run.',
    };
  }
  let outcome: AiHarnessCommandOutcome;
  try {
    outcome = await client.call(E.executeAiChatHarnessCommand, { params: { chatId }, body });
  } catch (error) {
    log.error('command.failed', error, { operation_id: body.operation_id });
    outcome = {
      status: 'unknown',
      message: 'Couldn’t confirm the command ran.',
    };
  }
  try {
    if (outcome.status === 'unknown')
      await AsyncStorage.setItem(key, JSON.stringify({ ...identity, status: 'unknown' }));
    else await AsyncStorage.removeItem(key);
  } catch (error) {
    log.error('command.receipt_failed', error, { operation_id: body.operation_id });
    return {
      status: 'unknown',
      message: 'Couldn’t confirm the command ran.',
    };
  }
  return outcome;
}
