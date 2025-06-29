// Type definitions for tail 2.2.6
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'tail' {
  import { EventEmitter } from 'events';

  export interface TailOptions {
    separator?: string | RegExp;
    fromBeginning?: boolean;
    fsWatchOptions?: object;
    encoding?: string;
    follow?: boolean;
    logger?: any;
    useWatchFile?: boolean;
    flushAtEOF?: boolean;
  }

  export class Tail extends EventEmitter {
    constructor(filename: string, options?: TailOptions);
    
    unwatch(): void;
    watch(): void;
    
    on(event: 'line', listener: (data: string) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
