import type { RuntimeLike } from "./types.js";

export interface Memory {
  content?: {
    text?: string;
  };
}

export interface State {
  [key: string]: unknown;
}

export interface ActionResult {
  text?: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
  success: boolean;
  error?: string | Error;
}

export type HandlerCallback = (response: { text?: string }) => Promise<unknown>;

export interface IAgentRuntime extends RuntimeLike {
  character?: {
    system?: string;
  };
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  validate: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => Promise<ActionResult | void>;
  examples: unknown[];
}

export interface Plugin {
  name: string;
  description: string;
  init?: (config: Record<string, string>, runtime: IAgentRuntime) => Promise<void>;
  actions?: Action[];
  providers?: unknown[];
  evaluators?: unknown[];
  models?: Record<
    string,
    (runtime: IAgentRuntime, params: Record<string, unknown>) => Promise<unknown>
  >;
  priority?: number;
}
