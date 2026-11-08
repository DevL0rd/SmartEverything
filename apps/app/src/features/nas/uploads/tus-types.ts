import type { Upload } from 'tus-js-client';

export type TusOptions = ConstructorParameters<typeof Upload>[1];

export type TusUrlStorage = NonNullable<TusOptions['urlStorage']>;

export type TusFileReader = NonNullable<TusOptions['fileReader']>;

export type TusPreviousUpload = Awaited<ReturnType<TusUrlStorage['findAllUploads']>>[number];
