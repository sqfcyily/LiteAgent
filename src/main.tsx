#!/usr/bin/env bun
import { getConfiguration, saveConfiguration } from './config/index.js';
import { runChatCommand } from './commands/chat.js';
import * as readline from 'readline';

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { 
    rl.close(); 
    resolve(ans); 
  }));
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
    
    // Crucial cleanup: readline hijacks keypress events and raw mode.
    // We must completely wipe its traces and explicitly resume stdin 
    // so React Ink can safely take over the terminal without immediately exiting or freezing.
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.removeAllListeners('keypress');
    process.stdin.resume();
    // 💡 Force the event loop to stay alive during the async transition phase
    // between readline closing and React Ink mounting.
    const keepAlive = setInterval(() => {}, 1000);
    setTimeout(() => clearInterval(keepAlive), 5000); // Clear after 5s assuming Ink has mounted
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
