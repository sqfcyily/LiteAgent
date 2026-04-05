import type { EngineEvent } from '../core/types.js';

export interface Channel {
  connect(): Promise<void>;
  onMessage(callback: (message: string) => void): void;
  sendMessage(content: string): Promise<string>;
  updateMessage(messageId: string, content: string): Promise<void>;
  
  // Renders the stream of engine events to the specific channel UI (e.g., CLI or Feishu Card)
  renderEngineStream(prompt: string, stream: AsyncGenerator<EngineEvent, void, unknown>): Promise<void>;
}
