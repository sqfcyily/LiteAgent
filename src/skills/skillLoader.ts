import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';

export interface SkillDefinition {
  name: string;
  description?: string;
  arguments?: string[];
  allowedTools?: string[];
  instructions: string;
}

export interface SkillData {
  personas: string[];
  skills: SkillDefinition[];
}

export async function loadSkills(): Promise<SkillData> {
  const result: SkillData = {
    personas: [],
    skills: []
  };

  const globalDir = path.join(os.homedir(), '.liteagent');
  const agentFile = path.join(globalDir, 'AGENT.md');
  const soulFile = path.join(globalDir, 'SOUL.md');

  if (fs.existsSync(agentFile)) {
    result.personas.push(fs.readFileSync(agentFile, 'utf-8'));
  }

  if (fs.existsSync(soulFile)) {
    result.personas.push(fs.readFileSync(soulFile, 'utf-8'));
  }

  // Read from ~/.liteagent/skills directory for actual callable skills
  const skillsDir = path.join(globalDir, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const skillFolders = fs.readdirSync(skillsDir);
    for (const folderName of skillFolders) {
      const folderPath = path.join(skillsDir, folderName);
      if (fs.statSync(folderPath).isDirectory()) {
        const skillMdPath = path.join(folderPath, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          const rawContent = fs.readFileSync(skillMdPath, 'utf-8');
          
          let description = `Execute skill: ${folderName}`;
          let args: string[] = [];
          let allowedTools: string[] | undefined = undefined;
          let instructions = rawContent;

          // Parse YAML Frontmatter if present
          const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
          const match = rawContent.match(frontmatterRegex);

          if (match) {
            try {
              const yamlContent = match[1];
              instructions = match[2];
              const parsedYaml = yaml.parse(yamlContent);

              if (parsedYaml.description) description = parsedYaml.description;
              if (parsedYaml.arguments) {
                if (Array.isArray(parsedYaml.arguments)) {
                  args = parsedYaml.arguments;
                } else if (typeof parsedYaml.arguments === 'string') {
                  args = parsedYaml.arguments.split(' ');
                }
              }
              if (parsedYaml['allowed-tools'] && Array.isArray(parsedYaml['allowed-tools'])) {
                allowedTools = parsedYaml['allowed-tools'];
              }
            } catch (e) {
              console.error(`Failed to parse frontmatter in skill ${folderName}:`, e);
              // Fallback to treating entire file as instructions
              instructions = rawContent;
            }
          }

          result.skills.push({
            name: folderName,
            description,
            arguments: args,
            allowedTools,
            instructions
          });
        }
      }
    }
  }

  return result;
}
