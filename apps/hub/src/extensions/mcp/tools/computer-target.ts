import { z } from 'zod';
import { deviceScopeOfActor } from './person-reach';
import { ToolError, type ToolContext } from './registry';
import { placedDevices, type Placed } from './targets';

export const COMPUTER_ID = z
  .uuid()
  .optional()
  .describe(
    'The computer, from device_find with family computer. Leave out for the computer this chat runs on, or the only computer in the home',
  );

type Reach = Pick<ToolContext, 'store' | 'actor' | 'caller'>;

function computersOf(context: Reach): Placed[] {
  return placedDevices(context.store, deviceScopeOfActor(context)).filter(
    ({ device }) => device.kind === 'computer',
  );
}

function chatComputerId(context: Reach): string | null {
  const chatId = context.actor?.chatId ?? null;
  const chat = chatId === null ? undefined : context.store.aiChats.find(chatId);
  const engine = chat?.engine;
  if (engine === undefined) return null;
  if (engine.kind === 'claude') return engine.device_id;
  if (engine.kind === 'dsh' && engine.execution_target.kind === 'device') {
    return engine.execution_target.device_id;
  }
  return null;
}

function listed(computers: readonly Placed[]): string {
  return computers.map(({ name, device }) => `${name} (deviceId ${device.id})`).join(', ');
}

export function computerIdOf(context: Reach, wanted: string | undefined): string {
  const computers = computersOf(context);
  if (wanted !== undefined) {
    if (computers.some(({ device }) => device.id === wanted)) return wanted;
    throw new ToolError(
      `${wanted} is not a computer you can reach; computers: ${listed(computers) || 'none'}. device_find with family computer lists them`,
      'not_found',
    );
  }
  const own = context.caller?.via === 'computer' ? context.caller.id : chatComputerId(context);
  if (own !== null && computers.some(({ device }) => device.id === own)) return own;
  const [only, second] = computers;
  if (only === undefined) throw new ToolError('This home has no computer', 'not_found');
  if (second !== undefined) {
    throw new ToolError(
      `Say which computer with deviceId: ${listed(computers)}`,
    );
  }
  return only.device.id;
}
