import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  random,
  Easing,
} from 'remotion';
import { COLORS, FONT } from './theme';

/* ------------------------------------------------------------------ */
/*  Animated gradient mesh — slow drifting purple blobs + vignette.    */
/* ------------------------------------------------------------------ */
export const GradientMesh = ({ intensity = 1, hueShift = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (cx, cy, r, color, speed, phase) => {
    const x = cx + Math.sin(t * speed + phase) * 8;
    const y = cy + Math.cos(t * speed * 0.8 + phase) * 8;
    return `radial-gradient(${r}% ${r}% at ${x}% ${y}%, ${color} 0%, transparent 60%)`;
  };
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <AbsoluteFill
        style={{
          opacity: 0.9 * intensity,
          backgroundImage: [
            blob(28, 35, 55, COLORS.purpleDeep, 0.5, 0),
            blob(75, 30, 50, COLORS.purple, 0.45, 2),
            blob(60, 80, 60, '#4c1d95', 0.4, 4),
            blob(20, 85, 45, COLORS.magenta, 0.55, 1.5),
          ].join(','),
          filter: `blur(${40}px) hue-rotate(${hueShift}deg)`,
        }}
      />
      {/* subtle radial vignette to keep edges cinematic */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(120% 120% at 50% 50%, transparent 45%, rgba(0,0,0,0.75) 100%)',
        }}
      />
      <Grain opacity={0.05} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Film grain — animated noise via layered tiny gradients (cheap).    */
/* ------------------------------------------------------------------ */
export const Grain = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2);
  return (
    <AbsoluteFill
      style={{
        opacity,
        mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${seed}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  Floating paint-dust particles — deterministic, drift upward.       */
/* ------------------------------------------------------------------ */
export const Particles = ({ count = 60, color = COLORS.purpleBright }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const dots = new Array(count).fill(0).map((_, i) => {
    const x = random(`x${i}`) * width;
    const baseY = random(`y${i}`) * height;
    const speed = 0.3 + random(`s${i}`) * 1.2;
    const size = 2 + random(`sz${i}`) * 6;
    const y = (baseY - frame * speed) % height;
    const yy = y < 0 ? y + height : y;
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(frame / 18 + i));
    const drift = Math.sin(frame / 30 + i) * 18;
    return { x: x + drift, y: yy, size, tw, i };
  });
  return (
    <AbsoluteFill>
      {dots.map((d) => (
        <div
          key={d.i}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            borderRadius: '50%',
            background: color,
            opacity: d.tw * 0.5,
            filter: 'blur(0.5px)',
            boxShadow: `0 0 ${d.size * 2}px ${color}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Expanding shockwave ring.                                          */
/* ------------------------------------------------------------------ */
export const Shockwave = ({ startFrame = 0, color = COLORS.purpleBright, max = 1600, thickness = 6 }) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  if (local < 0) return null;
  const progress = interpolate(local, [0, 28], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const size = progress * max;
  const opacity = interpolate(progress, [0, 0.2, 1], [0, 0.9, 0]);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `${thickness}px solid ${color}`,
          opacity,
          boxShadow: `0 0 60px ${color}`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Brush-stroke wipe reveal — a painterly band that swipes across.    */
/* ------------------------------------------------------------------ */
export const BrushReveal = ({ children, delay = 0, dir = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  const from = dir === 'left' ? -100 : 100;
  const clip =
    dir === 'left'
      ? `inset(0 ${interpolate(p, [0, 1], [100, 0])}% 0 0)`
      : `inset(0 0 0 ${interpolate(p, [0, 1], [100, 0])}%)`;
  return (
    <div style={{ clipPath: clip, WebkitClipPath: clip }}>
      <div style={{ transform: `translateX(${interpolate(p, [0, 1], [from * 0.1, 0])}px)` }}>
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Split-text: each word springs in with blur + rise.                 */
/* ------------------------------------------------------------------ */
export const SplitText = ({
  text,
  delay = 0,
  stagger = 4,
  style = {},
  by = 'word',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = by === 'char' ? text.split('') : text.split(' ');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', ...style }}>
      {parts.map((part, i) => {
        const p = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 14, mass: 0.6, stiffness: 120 },
        });
        const y = interpolate(p, [0, 1], [70, 0]);
        const blur = interpolate(p, [0, 1], [16, 0]);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${y}px)`,
              opacity: p,
              filter: `blur(${blur}px)`,
              marginRight: by === 'char' ? 0 : '0.28em',
              whiteSpace: 'pre',
            }}
          >
            {part === ' ' ? ' ' : part}
          </span>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Glass card — the app's signature liquid-glass surface.             */
/* ------------------------------------------------------------------ */
export const GlassCard = ({ children, style = {}, glow = COLORS.purple }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.14)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 32,
      boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 70px ${glow}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Number / text counter that rolls up.                              */
/* ------------------------------------------------------------------ */
export const Counter = ({ to, prefix = '', suffix = '', delay = 0, duration = 30, style = {} }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame - delay, [0, duration], [0, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <span style={style}>
      {prefix}
      {Math.round(v).toLocaleString()}
      {suffix}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  Browser frame — wraps a real app screenshot in a macOS-style window */
/*  with a moving glare sweep. `src` is a staticFile path.             */
/* ------------------------------------------------------------------ */
export const BrowserFrame = ({ src, width = 1040, glow = COLORS.purple, glareDelay = 0 }) => {
  const frame = useCurrentFrame();
  const dot = (c) => (
    <div style={{ width: 13, height: 13, borderRadius: '50%', background: c }} />
  );
  const glare = interpolate(frame - glareDelay, [0, 40], [-120, 220], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <div
      style={{
        width,
        borderRadius: 18,
        overflow: 'hidden',
        background: '#15131d',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: `0 50px 130px rgba(0,0,0,0.65), 0 0 90px ${glow}40, inset 0 1px 0 rgba(255,255,255,0.18)`,
        position: 'relative',
      }}
    >
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 16px',
          background: '#0d0c14',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {dot('#ff5f57')}
        {dot('#febc2e')}
        {dot('#28c840')}
        <div
          style={{
            margin: '0 auto',
            padding: '4px 26px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.07)',
            color: COLORS.gray,
            fontFamily: FONT,
            fontSize: 16,
            letterSpacing: '0.02em',
          }}
        >
          thecreativityapp.com
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <Img src={src} style={{ width: '100%', display: 'block' }} />
        {/* glare sweep */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${glare}%`,
            width: '40%',
            height: '100%',
            background:
              'linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

/* Shared text styles */
export const baseText = {
  fontFamily: FONT,
  color: COLORS.white,
  margin: 0,
  letterSpacing: '-0.02em',
};
