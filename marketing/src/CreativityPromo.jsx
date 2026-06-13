import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  random,
  Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, SCENES, TOTAL } from './theme';
import {
  GradientMesh,
  Particles,
  Shockwave,
  GlassCard,
  BrowserFrame,
  baseText,
} from './lib';

const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
});

const txt = { ...baseText, fontFamily };

/* Fade a scene in/out at its edges. */
const useInOut = (dur, inF = 8, outF = 8) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, inF, dur - outF, dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

/* =================================================================== */
/*  HOOK                                                                */
/* =================================================================== */
const Hook = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 6, 10);
  const swipe = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const bandX = interpolate(swipe, [0, 1], [-1300, 2200]);
  const reveal = interpolate(frame, [8, 28], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const sub = spring({ frame: frame - 36, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.5} />
      <Particles count={40} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ clipPath: `inset(0 ${reveal}% 0 0)` }}>
          <h1
            style={{
              ...txt,
              fontSize: 190,
              fontWeight: 800,
              backgroundImage: `linear-gradient(100deg, ${COLORS.white}, ${COLORS.purpleBright})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            You make art.
          </h1>
        </div>
        <div
          style={{
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [30, 0])}px)`,
            marginTop: 24,
          }}
        >
          <p style={{ ...txt, fontSize: 48, color: COLORS.gray, fontWeight: 400 }}>
            But who actually sees it?
          </p>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: bandX,
            width: 700,
            height: 1400,
            transform: 'rotate(12deg)',
            background: `linear-gradient(90deg, transparent, ${COLORS.purple}, ${COLORS.magenta}, transparent)`,
            filter: 'blur(40px)',
            opacity: 0.8,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  PROBLEM                                                             */
/* =================================================================== */
const Problem = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 8, 10);

  const tiles = new Array(24).fill(0).map((_, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const p = spring({ frame: frame - i * 1.1, fps, config: { damping: 18 } });
    const dim = interpolate(frame, [34, 64], [1, 0.1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 260 + col * 240,
          top: 150 + row * 230,
          width: 200,
          height: 200,
          borderRadius: 18,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          opacity: p * dim,
          transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})`,
        }}
      />
    );
  });
  const textP = spring({ frame: frame - 34, fps, config: { damping: 15 } });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.25} />
      {tiles}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ opacity: textP, transform: `scale(${interpolate(textP, [0, 1], [1.15, 1])})`, textAlign: 'center' }}>
          <p style={{ ...txt, fontSize: 92, fontWeight: 700, lineHeight: 1.04 }}>
            The feed buries<br />your work.
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  REVEAL                                                              */
/* =================================================================== */
const Reveal = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 6, 12);
  const slam = spring({ frame, fps, config: { damping: 12, mass: 1.1, stiffness: 140 } });
  const logoScale = interpolate(slam, [0, 1], [3.2, 1]);
  const logoBlur = interpolate(slam, [0, 0.6, 1], [40, 4, 0]);
  const glow = interpolate(frame, [8, 20, 40], [0, 1, 0.55], { extrapolateRight: 'clamp' });
  const wordP = spring({ frame: frame - 16, fps, config: { damping: 16 } });
  const tagP = spring({ frame: frame - 38, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.8} />
      <Particles count={70} />
      <Shockwave startFrame={8} />
      <Shockwave startFrame={14} color={COLORS.magenta} max={2000} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <Img
          src={staticFile('creativitylogo.png')}
          style={{
            width: 300,
            height: 300,
            transform: `scale(${logoScale})`,
            filter: `blur(${logoBlur}px) drop-shadow(0 0 ${60 * glow}px ${COLORS.purple})`,
          }}
        />
        <h1
          style={{
            ...txt,
            fontSize: 130,
            fontWeight: 800,
            marginTop: 10,
            opacity: wordP,
            transform: `translateY(${interpolate(wordP, [0, 1], [40, 0])}px)`,
            backgroundImage: `linear-gradient(100deg, ${COLORS.white} 30%, ${COLORS.purpleBright})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Creativity
        </h1>
        <p style={{ ...txt, fontSize: 42, fontWeight: 400, color: COLORS.gray, marginTop: 8, opacity: tagP, letterSpacing: '0.04em' }}>
          The home for your art
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  SCREEN SHOWCASE (reused with real screenshots)                     */
/* =================================================================== */
const Showcase = ({ dur, src, kicker, title, sub, accent, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 8, 10);
  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.9, stiffness: 110 } });
  const textP = spring({ frame: frame - 8, fps, config: { damping: 16 } });
  const float = Math.sin(frame / 26) * 10;
  const left = align === 'left';
  const tilt = interpolate(enter, [0, 1], [left ? 10 : -10, left ? 4 : -4]);

  const ImgBlock = (
    <div
      style={{
        opacity: enter,
        transform: `perspective(1600px) rotateY(${tilt}deg) translateX(${interpolate(
          enter, [0, 1], [left ? -160 : 160, 0]
        )}px) translateY(${float}px) scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
      }}
    >
      <BrowserFrame src={src} width={1020} glow={accent} glareDelay={10} />
    </div>
  );

  const TextBlock = (
    <div
      style={{
        opacity: textP,
        transform: `translateY(${interpolate(textP, [0, 1], [40, 0])}px)`,
        maxWidth: 560,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '8px 20px',
          borderRadius: 100,
          background: `${accent}22`,
          border: `1px solid ${accent}66`,
          color: accent,
          fontFamily,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 26,
        }}
      >
        {kicker}
      </div>
      <h2 style={{ ...txt, fontSize: 86, fontWeight: 700, lineHeight: 1.0 }}>{title}</h2>
      <p style={{ ...txt, fontSize: 38, fontWeight: 400, color: COLORS.gray, marginTop: 22, lineHeight: 1.3 }}>
        {sub}
      </p>
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.45} />
      <Particles count={30} color={accent} />
      <AbsoluteFill
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 110px',
          gap: 60,
        }}
      >
        {left ? ImgBlock : TextBlock}
        {left ? TextBlock : ImgBlock}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  PRICING — Free vs Pro                                               */
/* =================================================================== */
const Check = ({ children, delay, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-20, 0])}px)`, marginBottom: 18 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
      </div>
      <span style={{ ...txt, fontSize: 30, fontWeight: 400, color: '#e5e5ea' }}>{children}</span>
    </div>
  );
};

const Pricing = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 8, 14);
  const head = spring({ frame, fps, config: { damping: 16 } });
  const freeCard = spring({ frame: frame - 12, fps, config: { damping: 16, mass: 0.9 } });
  const proCard = spring({ frame: frame - 20, fps, config: { damping: 13, mass: 1 } });
  const proPulse = 1 + Math.sin(frame / 10) * 0.012;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.7} />
      <Particles count={50} />
      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [-30, 0])}px)`, textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ ...txt, fontSize: 96, fontWeight: 800 }}>
            Start free. <span style={{ color: COLORS.purpleBright }}>Stay free.</span>
          </h2>
          <p style={{ ...txt, fontSize: 38, color: COLORS.gray, fontWeight: 400, marginTop: 12 }}>
            No paywalls to post, share or grow. Pro is just the cherry on top.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 44, alignItems: 'stretch' }}>
          {/* FREE */}
          <div style={{ opacity: freeCard, transform: `translateY(${interpolate(freeCard, [0, 1], [60, 0])}px)` }}>
            <GlassCard glow={COLORS.cyan} style={{ width: 540, padding: '52px 56px' }}>
              <p style={{ ...txt, fontSize: 34, fontWeight: 600, color: COLORS.cyan, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Free</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '14px 0 8px' }}>
                <span style={{ ...txt, fontSize: 120, fontWeight: 800, lineHeight: 0.9 }}>$0</span>
                <span style={{ ...txt, fontSize: 32, color: COLORS.gray, marginBottom: 18 }}>forever</span>
              </div>
              <p style={{ ...txt, fontSize: 28, color: COLORS.gray, fontWeight: 400, marginBottom: 34 }}>Everything you need to be seen.</p>
              <Check delay={24} accent={COLORS.cyan}>Post unlimited artwork</Check>
              <Check delay={29} accent={COLORS.cyan}>Build your gallery & profile</Check>
              <Check delay={34} accent={COLORS.cyan}>Climb the creative ranks</Check>
              <Check delay={39} accent={COLORS.cyan}>Follow & message artists</Check>
            </GlassCard>
          </div>

          {/* PRO */}
          <div style={{ opacity: proCard, transform: `translateY(${interpolate(proCard, [0, 1], [60, 0])}px) scale(${proPulse})` }}>
            <div
              style={{
                width: 560,
                padding: '52px 56px',
                borderRadius: 32,
                background: `linear-gradient(160deg, ${COLORS.purpleDeep}, ${COLORS.bg2})`,
                border: `1.5px solid ${COLORS.purpleBright}`,
                boxShadow: `0 40px 110px rgba(0,0,0,0.6), 0 0 90px ${COLORS.purple}66`,
                position: 'relative',
              }}
            >
              <div style={{ position: 'absolute', top: -18, right: 40, padding: '8px 22px', borderRadius: 100, background: `linear-gradient(120deg, ${COLORS.gold}, ${COLORS.magenta})`, ...txt, fontSize: 24, fontWeight: 700 }}>
                BEST VALUE
              </div>
              <p style={{ ...txt, fontSize: 34, fontWeight: 600, color: COLORS.purpleBright, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Creativity Pro</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '14px 0 8px' }}>
                <span style={{ ...txt, fontSize: 120, fontWeight: 800, lineHeight: 0.9, backgroundImage: `linear-gradient(120deg, ${COLORS.gold}, ${COLORS.magenta}, ${COLORS.purpleBright})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>$4.99</span>
                <span style={{ ...txt, fontSize: 32, color: COLORS.gray, marginBottom: 18 }}>/mo</span>
              </div>
              <p style={{ ...txt, fontSize: 28, color: COLORS.gray, fontWeight: 400, marginBottom: 34 }}>Stand out. Reach further.</p>
              <Check delay={32} accent={COLORS.purple}>Gold frame, Pro badge & name colors</Check>
              <Check delay={37} accent={COLORS.purple}>Explore boost — priority in the feed</Check>
              <Check delay={42} accent={COLORS.purple}>Advanced analytics & 50 MB uploads</Check>
              <Check delay={47} accent={COLORS.purple}>Custom emojis & priority stories</Check>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  CTA                                                                 */
/* =================================================================== */
const CTA = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useInOut(dur, 10, 20);
  const logoP = spring({ frame, fps, config: { damping: 13, mass: 1 } });
  const wordP = spring({ frame: frame - 14, fps, config: { damping: 16 } });
  const btnP = spring({ frame: frame - 34, fps, config: { damping: 12 } });
  const urlP = spring({ frame: frame - 50, fps, config: { damping: 18 } });
  const pulse = 1 + Math.sin(frame / 8) * 0.025;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>
      <GradientMesh intensity={0.85} />
      <Particles count={80} />
      <Shockwave startFrame={4} max={2400} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <Img
          src={staticFile('creativitylogo.png')}
          style={{ width: 220, height: 220, transform: `scale(${interpolate(logoP, [0, 1], [0, 1])})`, filter: `drop-shadow(0 0 50px ${COLORS.purple})` }}
        />
        <h1
          style={{
            ...txt,
            fontSize: 110,
            fontWeight: 800,
            marginTop: 6,
            opacity: wordP,
            transform: `translateY(${interpolate(wordP, [0, 1], [40, 0])}px)`,
            backgroundImage: `linear-gradient(100deg, ${COLORS.white} 30%, ${COLORS.purpleBright})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Creativity
        </h1>
        <p style={{ ...txt, fontSize: 42, color: COLORS.gray, fontWeight: 400, marginTop: 4, marginBottom: 50, opacity: wordP }}>
          Create for people who get it.
        </p>
        <div
          style={{
            opacity: btnP,
            transform: `scale(${interpolate(btnP, [0, 1], [0.7, 1]) * pulse})`,
            padding: '32px 80px',
            borderRadius: 100,
            background: `linear-gradient(120deg, ${COLORS.purpleDeep}, ${COLORS.magenta})`,
            boxShadow: `0 20px 60px ${COLORS.purple}aa`,
          }}
        >
          <span style={{ ...txt, fontSize: 56, fontWeight: 700 }}>Join free →</span>
        </div>
        <p style={{ ...txt, fontSize: 48, fontWeight: 500, marginTop: 44, opacity: urlP, color: COLORS.purpleBright, letterSpacing: '0.02em' }}>
          thecreativityapp.com
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =================================================================== */
/*  MASTER                                                              */
/* =================================================================== */
export const CreativityPromo = () => {
  const shows = [
    {
      ...SCENES.explore,
      src: staticFile('screens/10-explore-art.png'),
      kicker: 'Discover',
      title: 'A universe of artists',
      sub: 'Scroll a feed built only for art — and the people who make it.',
      accent: COLORS.purple,
      align: 'left',
    },
    {
      ...SCENES.profile,
      src: staticFile('screens/12-creator-profile.png'),
      kicker: 'Your space',
      title: 'A gallery that’s truly yours',
      sub: 'Cover photo, frames, colors — a profile as unique as your work.',
      accent: COLORS.magenta,
      align: 'right',
    },
    {
      ...SCENES.ranks,
      src: staticFile('screens/04-ranks.png'),
      kicker: 'Progress',
      title: 'Level up your craft',
      sub: 'Climb the hierarchy of creativity, from Fresh Canvas to master.',
      accent: COLORS.gold,
      align: 'left',
    },
    {
      ...SCENES.post,
      src: staticFile('screens/14-post-detail.png'),
      kicker: 'Connect',
      title: 'Get seen. Get loved.',
      sub: 'Likes, comments, real conversations around every piece you share.',
      accent: COLORS.cyan,
      align: 'right',
    },
  ];

  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily }}>
      {/* Music: "Inspired" by Kevin MacLeod (incompetech.com), CC BY 4.0.
          Start ~60s in to ride the track's sustained, energetic main body. */}
      <Audio
        src={staticFile('audio/Inspired.mp3')}
        startFrom={Math.round(60 * fps)}
        volume={(f) =>
          interpolate(f, [0, 14, TOTAL - 48, TOTAL], [0, 0.9, 0.9, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
      <Sequence from={SCENES.hook.from} durationInFrames={SCENES.hook.dur}>
        <Hook dur={SCENES.hook.dur} />
      </Sequence>
      <Sequence from={SCENES.problem.from} durationInFrames={SCENES.problem.dur}>
        <Problem dur={SCENES.problem.dur} />
      </Sequence>
      <Sequence from={SCENES.reveal.from} durationInFrames={SCENES.reveal.dur}>
        <Reveal dur={SCENES.reveal.dur} />
      </Sequence>
      {shows.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.dur}>
          <Showcase {...s} />
        </Sequence>
      ))}
      <Sequence from={SCENES.pricing.from} durationInFrames={SCENES.pricing.dur}>
        <Pricing dur={SCENES.pricing.dur} />
      </Sequence>
      <Sequence from={SCENES.cta.from} durationInFrames={SCENES.cta.dur}>
        <CTA dur={SCENES.cta.dur} />
      </Sequence>
    </AbsoluteFill>
  );
};
