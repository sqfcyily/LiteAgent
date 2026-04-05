import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface DioramaState {
  status: 'Pending' | 'In_Progress' | 'Completed' | 'Failed';
  message: string;
  toolInfo?: string;
}

const frames = {
  Pending: ['zZZ.', 'zZZ..', 'zZZ...'],
  In_Progress: ['[>  ]', '[=> ]', '[==>]', '[ ==]', '[  =]', '[   ]'], // Simulated working pixel animation
  Completed: ['🎉  ', ' 🎉 ', '  🎉', ' 🎉 '],
  Failed: ['🌧 🌧', ' 🌧 ', '🌧 🌧', ' 🌧 '],
};

export const DioramaStage: React.FC<{ state: DioramaState }> = ({ state }) => {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    let speed = 200;
    if (state.status === 'In_Progress') speed = 100; // Faster when working
    if (state.status === 'Completed') speed = 500; // Slower celebration

    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frames[state.status].length);
    }, speed);

    return () => clearInterval(timer);
  }, [state.status]);

  const currentFrame = frames[state.status][frameIdx];
  const color = state.status === 'Completed' ? 'green' : state.status === 'Failed' ? 'red' : state.status === 'In_Progress' ? 'cyan' : 'gray';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} marginY={1}>
      <Box marginBottom={1}>
        <Text bold color={color}>=== PixelTasker Diorama Stage ===</Text>
      </Box>
      <Box>
        <Text color={color}>{`[${state.status}] `}</Text>
        <Text bold>{currentFrame} </Text>
        <Text>{state.message}</Text>
      </Box>
      {state.toolInfo && (
        <Box marginTop={1}>
          <Text dimColor>🔧 {state.toolInfo}</Text>
        </Box>
      )}
    </Box>
  );
};
