#!/usr/bin/env bun
import { getConfiguration, saveConfiguration } from './config/index.js';
import { runChatCommand } from './commands/chat.js';
import { render } from 'ink';
import React from 'react';
import { SetupWizard } from './buddy/SetupWizard.js';

async function main() {
  let config = getConfiguration();

  if (!config.apiKey) {
    await new Promise<void>(resolve => {
      const { unmount } = render(
        <SetupWizard onComplete={(baseUrl, modelName, apiKey) => {
          saveConfiguration(baseUrl, modelName, apiKey);
          // Small delay before unmounting to ensure Ink cleanly flushes its final render
          setTimeout(() => {
            unmount();
            resolve();
          }, 100);
        }} />
      );
    });
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
