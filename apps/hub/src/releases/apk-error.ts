export type ApkFactsReason =
  | 'not_zip'
  | 'zip64'
  | 'zip_comment'
  | 'unsigned'
  | 'signing_block'
  | 'signers'
  | 'no_supported_signature'
  | 'signature'
  | 'public_key'
  | 'digest'
  | 'key_rotation'
  | 'signer_mismatch'
  | 'entries'
  | 'manifest';

export class ApkFactsError extends Error {
  override readonly name = 'ApkFactsError';

  constructor(
    readonly reason: ApkFactsReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
