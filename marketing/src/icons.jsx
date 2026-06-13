import React from 'react';

// Minimal stroke icons, sized via `s`, colored via `c`. Match lucide vibe.
const wrap = (s, c, children) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconGallery = ({ s = 64, c = '#fff' }) =>
  wrap(s, c, (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ));

export const IconTrophy = ({ s = 64, c = '#fff' }) =>
  wrap(s, c, (
    <>
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4z" />
      <path d="M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3" />
      <path d="M9 14.5V18M15 14.5V18M8 21h8M10 21v-3h4v3" />
    </>
  ));

export const IconPulse = ({ s = 64, c = '#fff' }) =>
  wrap(s, c, (
    <>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </>
  ));

export const IconUsers = ({ s = 64, c = '#fff' }) =>
  wrap(s, c, (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.5a5.5 5.5 0 0 1 3 5" />
    </>
  ));

export const IconSpark = ({ s = 64, c = '#fff' }) =>
  wrap(s, c, (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z" />
    </>
  ));
