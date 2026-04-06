import { getConfiguration } from './config/index.js';
import { runChatCommand } from './commands/chat.js';
import * as readline from 'readline';

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  let config = getConfiguration();

  if (!config.apiKey) {
    console.log('🔗 Enter BASE_URL (e.g. https://api.openai.com/v1):');
    const baseUrl = await askQuestion('> ');
    console.log('🤖 Enter MODEL_NAME (e.g. gpt-4o):');
    const modelName = await askQuestion('> ');
    console.log('🔑 Enter API_KEY:');
    const apiKey = await askQuestion('> ');

    const fs = await import('fs');
    fs.writeFileSync('.agentrc', JSON.stringify({ BASE_URL: baseUrl, MODEL_NAME: modelName, API_KEY: apiKey }, null, 2));
    config = getConfiguration();
  }

  const args = process.argv.slice(2);
  const command = args[0] || 'chat';

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
