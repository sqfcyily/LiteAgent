import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EngineConfig } from '../services/agentEngine.js';

const GLOBAL_CONFIG_FILE = path.join(os.homedir(), '.liteagentrc');
const LOCAL_CONFIG_FILE = '.agentrc';

export function getConfiguration(): EngineConfig {
  // Load global config first
  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    dotenv.config({ path: GLOBAL_CONFIG_FILE });
  }
  // Override with local config if it exists
  if (fs.existsSync(LOCAL_CONFIG_FILE)) {
    dotenv.config({ path: LOCAL_CONFIG_FILE, override: true });
  }

  return {
    baseUrl: process.env.BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.MODEL_NAME || 'gpt-4o',
    language: process.env.LANGUAGE || 'en-US',
    maxLoops: 10
  };
}

export function saveConfiguration(baseUrl: string, modelName: string, apiKey: string): void {
  const configContent = `BASE_URL=${baseUrl || 'https://api.openai.com/v1'}\nMODEL_NAME=${modelName || 'gpt-4o'}\nAPI_KEY=${apiKey}\nLANGUAGE=en-US\n`;
  // Always save to global config so it persists across directories
  fs.writeFileSync(GLOBAL_CONFIG_FILE, configContent, 'utf-8');
}
