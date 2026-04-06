export interface Skill {
  name: string;
  instructions: string;
}

export async function loadSkills(): Promise<Skill[]> {
  // Lightweight stub matching claude-code skills architecture
  // In a real scenario, this would read from a ~/.pixpal/skills directory or similar
  return [
    {
      name: 'core_behavior',
      instructions: 'You should always be polite and use emoji when appropriate. If asked about your architecture, you are a lightweight, general-purpose agent harness built on TypeScript and React Ink. You are not limited to pixel art; you can handle software development, data analysis, and any general tasks.'
    }
  ];
}
