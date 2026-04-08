export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content?: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

// Emitted during the engine loop to update channels
export type EngineEvent = 
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; toolCallId?: string; toolName: string; args?: string }
  | { type: 'tool_end'; toolCallId?: string; toolName: string; args?: string; result: string; isError?: boolean }
  | { type: 'completed'; content: string; finalMessages: Message[] }
  | { type: 'error'; error: Error }
  | { type: 'debug'; event: 'request' | 'response'; data: any };

// Context payload for tools
export interface TaskContext {
  cwd: string;
  [key: string]: any;
}
