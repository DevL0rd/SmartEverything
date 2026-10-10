declare global {
  interface AudioContextOptions {
    sinkId?: string;
  }

  interface AudioContext {
    setSinkId(sinkId: string): Promise<void>;
  }
}

export {};
