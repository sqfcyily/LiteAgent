import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SkillData {
  personas: string[];
  skills: { name: string; instructions: string }[];
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
          result.skills.push({
            name: folderName,
            instructions: fs.readFileSync(skillMdPath, 'utf-8')
          });
        }
      }
    }
  }

  return result;
}
