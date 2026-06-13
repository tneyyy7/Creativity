// Brand palette pulled straight from the live app.
// Dark theme background hsl(240 10% 4%); accent purple hsl(271 81% 56%).
export const COLORS = {
  bg: '#0a0a0f',
  bg2: '#160f24',
  bg3: '#1c1230',
  purple: '#a855f7',
  purpleDeep: '#7c3aed',
  purpleBright: '#c084fc',
  magenta: '#e879f9',
  cyan: '#38bdf8',
  gold: '#fbbf24',
  white: '#fafafa',
  gray: '#a1a1aa',
  grayDim: '#52525b',
};

export const FONT = 'Inter';

// Master timeline (frames @ 30fps) — single source of truth so scenes never overlap.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const SCENES = {
  hook: { from: 0, dur: 78 },
  problem: { from: 78, dur: 72 },
  reveal: { from: 150, dur: 96 },
  explore: { from: 246, dur: 96 },
  profile: { from: 342, dur: 96 },
  ranks: { from: 438, dur: 96 },
  post: { from: 534, dur: 96 },
  pricing: { from: 630, dur: 156 },
  cta: { from: 786, dur: 168 },
};

export const TOTAL = 954; // ~31.8s
