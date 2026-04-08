import { getSystemTools } from '../tools/index.js';
import { loadSkills } from '../skills/skillLoader.js';
import { initializeMCPClient } from '../mcp/mcpClient.js';
import { BuddyUI } from '../buddy/BuddyUI.js';
import { EngineConfig } from '../services/agentEngine.js';

export async function runChatCommand(config: EngineConfig) {
  // 1. Load Skills
  const skillData = await loadSkills();
  const skillInstructions = skillData.personas.join('\n\n');

  // 2. Initialize MCP Client & get external tools
  const mcpTools = await initializeMCPClient();

  // 3. Get System Tools
  const systemTools = getSystemTools(skillData.skills);

  // Combine all tools
  const allTools = [...systemTools, ...mcpTools];

  // 4. Start the Buddy UI
  const ui = new BuddyUI(config, allTools, skillInstructions);
  await ui.connect();
}
