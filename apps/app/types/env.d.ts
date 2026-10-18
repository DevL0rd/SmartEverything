declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_DEV_SERVER_URL?: string;
    readonly EXPO_PUBLIC_PROFILING?: string;
  }
}
