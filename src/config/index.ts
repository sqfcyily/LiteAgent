import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EngineConfig } from '../services/agentEngine.js';

export interface ModelConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
}

const GLOBAL_DIR = path.join(os.homedir(), '.liteagent');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DIR, '.agentrc');
const OLD_GLOBAL_CONFIG_FILE = path.join(os.homedir(), '.liteagentrc');
const LOCAL_CONFIG_FILE = '.agentrc';
const MODELS_FILE = path.join(GLOBAL_DIR, 'models.json');

export function getModels(): ModelConfig[] {
  let models: ModelConfig[] = [];
  if (fs.existsSync(MODELS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf-8'));
      if (Array.isArray(data)) models = data;
    } catch(e) {}
  }
  
  const current = getConfiguration();
  const currentModelStr = current.model || 'gpt-4o';
  const currentBaseUrl = current.baseUrl || 'https://api.openai.com/v1';
  
  if (current.apiKey) {
    const existing = models.find(m => m.name === currentModelStr && m.baseUrl === currentBaseUrl);
    if (!existing) {
      models.unshift({ name: currentModelStr, baseUrl: currentBaseUrl, apiKey: current.apiKey });
    }
  }
  return models;
}

export function saveModels(models: ModelConfig[]) {
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2), 'utf-8');
}

export function getConfiguration(): EngineConfig {
  // Migrate old config if it exists
  if (fs.existsSync(OLD_GLOBAL_CONFIG_FILE) && !fs.existsSync(GLOBAL_CONFIG_FILE)) {
    if (!fs.existsSync(GLOBAL_DIR)) {
      fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    }
    fs.renameSync(OLD_GLOBAL_CONFIG_FILE, GLOBAL_CONFIG_FILE);
  }

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
    maxLoops: 25
  };
}

export function setActiveModel(model: ModelConfig) {
  saveConfiguration(model.baseUrl, model.name, model.apiKey);
  
  // Ensure it's in the list
  const models = getModels();
  if (!models.find(m => m.name === model.name && m.baseUrl === model.baseUrl)) {
    models.unshift(model);
    saveModels(models);
  }
}

export function saveConfiguration(baseUrl: string, modelName: string, apiKey: string): void {
  const configContent = `BASE_URL=${baseUrl || 'https://api.openai.com/v1'}\nMODEL_NAME=${modelName || 'gpt-4o'}\nAPI_KEY=${apiKey}\nLANGUAGE=en-US\n`;
  
  // Ensure the global directory and skills directory exist
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  const skillsDir = path.join(GLOBAL_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  // Always save to global config so it persists across directories
  fs.writeFileSync(GLOBAL_CONFIG_FILE, configContent, 'utf-8');
}
