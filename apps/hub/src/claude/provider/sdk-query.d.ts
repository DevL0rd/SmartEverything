import '@anthropic-ai/claude-agent-sdk';

declare module '@anthropic-ai/claude-agent-sdk' {
  interface Query {
    interrupt(options: { readonly cancelQueued: boolean }): Promise<unknown>;
  }
}
