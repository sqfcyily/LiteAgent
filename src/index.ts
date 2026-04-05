import * as dotenv from 'dotenv';
import { runEngine } from './core/engine.js';
import { CLIChannel } from './channels/cli/CLIChannel.js';
import { FeishuChannel } from './channels/feishu/FeishuChannel.js';
import type { Channel } from './channels/base.js';

// Initialize configuration from .env or .agentrc
dotenv.config({ path: '.agentrc' });

const config = {
  baseUrl: process.env.BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.API_KEY || '',
  model: process.env.MODEL_NAME || 'gpt-4o',
  language: process.env.LANGUAGE || 'en-US',
  channel: process.env.CHANNEL || 'cli',
  feishuAppId: process.env.FEISHU_APP_ID || '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET || ''
};

async function main() {
  console.log(`\n🚀 PixelTasker Starting... [Model: ${config.model}, Channel: ${config.channel}]\n`);

  let activeChannel: Channel;

  // Mount the selected channel
  if (config.channel === 'feishu') {
    activeChannel = new FeishuChannel(config.feishuAppId, config.feishuAppSecret);
  } else {
    activeChannel = new CLIChannel();
  }

  await activeChannel.connect();

  // Test prompt - in a real app, this comes from channel.onMessage
  const testPrompt = "Hello! Please use the echo tool to say 'PixelTasker is alive!'";
  
  // Create the AsyncGenerator stream
  // Note: For now, we mock the tools import. In reality, you'd export the schema array from tools/index.ts
  const tools = [{
    type: 'function' as const,
    function: {
      name: 'echo',
      description: 'Echoes back the input',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    }
  }];

  const stream = runEngine(testPrompt, tools, config);

  // Hand the stream over to the channel for rendering
  await activeChannel.renderEngineStream(testPrompt, stream);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
