export interface Skill {
  name: string;
  instructions: string;
}

export async function loadSkills(): Promise<Skill[]> {
  // Lightweight stub matching claude-code skills architecture
  // In a real scenario, this would read from a ~/.liteagent/skills directory or similar
  return [
    {
      name: 'core_behavior',
      instructions: 'You are a lightweight, general-purpose agent harness built on TypeScript and React Ink. You can handle software development, data analysis, and any general tasks.'
    }
  ];
}
