import { Channel } from './base.js';
import type { EngineEvent } from '../core/types.js';

export class FeishuChannel implements Channel {
  private appId: string;
  private appSecret: string;
  
  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  async connect(): Promise<void> {
    console.log(`[Feishu] Connecting via WebSocket for AppID: ${this.appId}...`);
    // Placeholder for actual Feishu WebSocket SDK initialization
  }

  onMessage(callback: (message: string) => void): void {
    console.log('[Feishu] Listening for incoming messages...');
    // Simulate a message from Feishu for testing
    // setTimeout(() => callback('Hello PixelTasker, please echo this test!'), 2000);
  }

  async sendMessage(content: string): Promise<string> {
    const msgId = `fs-msg-${Date.now()}`;
    console.log(`[Feishu Send] -> ${msgId}: ${content}`);
    return msgId;
  }

  async updateMessage(messageId: string, content: string): Promise<void> {
    // Note: To implement typewriter effects, you'd patch the Feishu Card JSON here.
    console.log(`[Feishu Update] -> ${messageId}: ${content}`);
  }

  async renderEngineStream(prompt: string, stream: AsyncGenerator<EngineEvent, void, unknown>): Promise<void> {
    // 1. Create a "Pixel Diorama" Card in Feishu immediately
    const cardId = await this.sendMessage(`[Task Created] ${prompt}\n\n[Status: Pending] zZZ...`);
    
    let currentContent = '';
    let currentToolState = '';

    // 2. Consume the engine stream and update the card dynamically
    for await (const event of stream) {
      let stateLine = '';

      switch (event.type) {
        case 'thinking':
          stateLine = `[Status: In_Progress] ⏳ Thinking...\n> ${event.content}`;
          break;
        case 'tool_start':
          currentToolState = `\n\n🔧 Using Tool [${event.toolName}] with args: ${event.args}`;
          stateLine = `[Status: In_Progress] ⏳ Executing Tool...${currentToolState}`;
          break;
        case 'tool_end':
          currentToolState = `\n\n✅ Tool [${event.toolName}] completed. Result: ${event.result}`;
          stateLine = `[Status: In_Progress] ⏳ Resuming Thought...${currentToolState}`;
          break;
        case 'completed':
          stateLine = `[Status: Completed] 🎉 Done!\n\n${event.content}`;
          break;
        case 'error':
          stateLine = `[Status: Failed] 🌧 Error occurred: ${event.error.message}`;
          break;
      }

      // Update the Feishu Card with the new state (throttle this in production)
      await this.updateMessage(cardId, `[Task] ${prompt}\n\n${stateLine}`);
    }
  }
}
