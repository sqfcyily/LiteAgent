export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string;
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
  | { type: 'tool_start'; toolName: string; args: string }
  | { type: 'tool_end'; toolName: string; result: string }
  | { type: 'completed'; content: string; finalMessages: Message[] }
  | { type: 'error'; error: Error };

// Context payload for tools
export interface TaskContext {
  cwd: string;
  [key: string]: any;
}
