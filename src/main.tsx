import { getConfiguration, saveConfiguration } from './config/index.js';
import { runChatCommand } from './commands/chat.js';
import * as readline from 'readline';

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  let config = getConfiguration();

  if (!config.apiKey) {
    console.log('🚀 Welcome to LiteAgent! Let\'s set up your agent.\n');
    const baseUrl = await askQuestion('🔗 Enter BASE_URL (e.g. https://api.openai.com/v1): ');
    const modelName = await askQuestion('🤖 Enter MODEL_NAME (e.g. gpt-4o): ');
    const apiKey = await askQuestion('🔑 Enter API_KEY: ');

    saveConfiguration(baseUrl, modelName, apiKey);
    config = getConfiguration();
  }

  const args = process.argv.slice(2);
  const isDev = args.includes('--dev');
  config.isDev = isDev;

  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'chat';

  switch (command) {
    case 'chat':
    default:
      await runChatCommand(config);
      break;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
