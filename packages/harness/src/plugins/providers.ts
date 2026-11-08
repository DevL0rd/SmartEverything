import type { Context } from '@deepseek-ai/cordis';
import CredentialProvider, {
  credentialRef,
  isCredentialRefName,
} from '@deepseek-ai/dsh-credentials';
import type {
  CredentialInfo,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials';
import DeepSeekLlmApiExtensions from '@deepseek-ai/dsh-deepseek-llm-api-extensions';
import * as DeepSeekApiKey from '@deepseek-ai/dsh-llm-deepseek-api-key';
import * as SessionLogDeepSeek from '@deepseek-ai/dsh-session-log-deepseek';

export const name = 'providers';

export interface ApiKeyVault {
  readonly source: string;
  readonly read: (reference: string) => Promise<string | undefined>;
  readonly write: (reference: string, value: string) => Promise<void>;
  readonly remove: (reference: string) => Promise<void>;
  readonly watch: (listener: (reference: string) => void) => () => void;
}

export class ApiKeyCredentials extends CredentialProvider {
  constructor(
    ctx: Context,
    private readonly vault: ApiKeyVault,
  ) {
    super(ctx);
    ctx.effect(() =>
      vault.watch((reference) => {
        if (isCredentialRefName(reference)) this.notifyUpdated(credentialRef(reference));
      }),
    );
  }

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = await this.stored(ref);
    return value === undefined ? undefined : { value, source: this.vault.source };
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const value = await this.stored(ref);
    return {
      configured: value !== undefined,
      ...(value === undefined ? {} : { source: this.vault.source }),
      writable: true,
    };
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0)
      return Promise.reject(
        new TypeError('A credential cannot be stored empty; unset it instead.'),
      );
    return this.vault.write(ref, value);
  }

  unset(ref: CredentialRef): Promise<void> {
    return this.vault.remove(ref);
  }

  readRecord(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  describeRecord(): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: false });
  }

  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([]);
  }

  modifyRecord(): Promise<never> {
    return Promise.reject(new TypeError('Authorization grants are not stored by this provider.'));
  }

  deleteRecord(): Promise<void> {
    return Promise.resolve();
  }

  private async stored(ref: CredentialRef): Promise<string | undefined> {
    const value = await this.vault.read(ref);
    return value === undefined || value.length === 0 ? undefined : value;
  }
}

export async function mount(ctx: Context): Promise<void> {
  await ctx.inject(['credentials'], async (active: Context): Promise<void> => {
    await active.plugin(DeepSeekLlmApiExtensions);
    await active.plugin(DeepSeekApiKey);
    await active.plugin(SessionLogDeepSeek);
  });
}
