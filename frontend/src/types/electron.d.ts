interface Window {
  electron?: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    removeListener: (channel: string, callback: (...args: any[]) => void) => void;
    platform: string;
  };
}

