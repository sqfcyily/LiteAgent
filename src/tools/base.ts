import type { ToolSchema } from '../utils/types.js';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, any>;
  
  // Whether the tool can be safely executed concurrently with other safe tools
  isConcurrencySafe: boolean = false;

  abstract call(input: any, context?: any): Promise<string>;

  toSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.inputSchema
      }
    };
  }
}
