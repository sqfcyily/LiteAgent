import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';
import { runEngine } from './core/engine.js';
import { CLIChannel } from './channels/cli/CLIChannel.js';
import { FeishuChannel } from './channels/feishu/FeishuChannel.js';
import type { Channel } from './channels/base.js';

const CONFIG_FILE = '.agentrc';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function initConfig(): Promise<void> {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log('✨ Welcome to PixPal! Let\'s set up your agent.\n');
    const baseUrl = await askQuestion('🔗 Enter BASE_URL (e.g. https://api.openai.com/v1): ');
    const model = await askQuestion('🤖 Enter MODEL_NAME (e.g. gpt-4o): ');
    const apiKey = await askQuestion('🔑 Enter API_KEY: ');
    
    const configContent = `BASE_URL=${baseUrl || 'https://api.openai.com/v1'}\nMODEL_NAME=${model || 'gpt-4o'}\nAPI_KEY=${apiKey}\nLANGUAGE=en-US\nCHANNEL=cli\n`;
    fs.writeFileSync(CONFIG_FILE, configContent, 'utf-8');
    console.log(`\n✅ Configuration saved to ${CONFIG_FILE}\n`);
  }
}

async function main() {
  await initConfig();
  
  // Initialize configuration from .env or .agentrc
  dotenv.config({ path: CONFIG_FILE });

  const config = {
    baseUrl: process.env.BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.MODEL_NAME || 'gpt-4o',
    language: process.env.LANGUAGE || 'en-US',
    channel: process.env.CHANNEL || 'cli',
    feishuAppId: process.env.FEISHU_APP_ID || '',
    feishuAppSecret: process.env.FEISHU_APP_SECRET || '',
    maxLoops: 10
  };

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

  console.log(`\n🚀 PixPal Starting... [Model: ${config.model}, Channel: ${config.channel}]\n`);

  let activeChannel: Channel;

  // Mount the selected channel
  if (config.channel === 'feishu') {
    activeChannel = new FeishuChannel(config.feishuAppId, config.feishuAppSecret);
  } else {
    // Pass config and tools into CLIChannel directly
    activeChannel = new CLIChannel(config, tools);
  }

  // The connect method now blocks and handles the entire interactive loop inside React
  await activeChannel.connect();
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
