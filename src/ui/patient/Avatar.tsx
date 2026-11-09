import type { CSSProperties } from 'react';
import type { Signs } from '../../engine/types.ts';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Props {
  signs: Signs;
  rr: number;
  arrest: boolean;
  label: string;
}

export function Avatar({ signs, rr, arrest, label }: Props) {
  const s = (k: string) => signs[k] ?? 0;
  const lip = s('lipSwelling');
  const effort = s('effort');
  const eyesClosed = arrest || s('eyesClosed') > 0.5;
  const anxious = s('anxiety') > 0.4 && !eyesClosed;
  const mouthOpen = arrest ? 0 : clamp01((effort - 0.3) / 0.6) * 7;
  const breath: CSSProperties = {
    animationDuration: rr > 0 && !arrest ? `${(60 / rr).toFixed(2)}s` : '0s',
    animationPlayState: rr > 0 && !arrest ? 'running' : 'paused',
    ['--effort' as string]: String(0.015 + effort * 0.04),
  };
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} className="avatar">
      <g className="avatar-breath" style={breath}>
        <path d="M18 200 C 24 160, 60 150, 100 150 C 140 150, 176 160, 182 200 Z" fill="#6E9BB8" />
        <path d="M84 150 L100 172 L116 150 Z" fill="#5A86A3" />
      </g>
      <rect x="86" y="128" width="28" height="26" fill="#BE8762" />
      <ellipse cx="100" cy="88" rx="54" ry="62" fill="#C99169" />
      <ellipse
        cx="100"
        cy="92"
        rx="54"
        ry="58"
        fill="#E0463C"
        opacity={arrest ? 0 : s('flush') * 0.36}
      />
      <ellipse cx="100" cy="92" rx="54" ry="58" fill="#C8CFD2" opacity={s('sweating') * 0.3} />
      <ellipse
        cx="100"
        cy="92"
        rx="54"
        ry="58"
        fill="#5C7FA8"
        opacity={arrest ? 0.45 : s('cyanosis') * 0.45}
      />
      <path
        d="M46 78 C 44 34, 80 18, 104 22 C 136 24, 158 44, 154 80 C 148 58, 128 46, 100 46 C 76 46, 54 56, 46 78 Z"
        fill="#2B211C"
      />
      <g fill="#D8524A" opacity={clamp01(s('hives'))}>
        <ellipse cx="66" cy="104" rx="6" ry="4" />
        <ellipse cx="136" cy="100" rx="7" ry="4" />
        <ellipse cx="78" cy="122" rx="5" ry="3" />
        <ellipse cx="124" cy="124" rx="5" ry="3" />
        <ellipse cx="96" cy="140" rx="6" ry="3" />
        <ellipse cx="60" cy="168" rx="7" ry="4" />
        <ellipse cx="140" cy="172" rx="8" ry="4" />
        <ellipse cx="112" cy="186" rx="6" ry="3" />
      </g>
      <g fill="#E8F4F8" opacity={clamp01(s('sweating') * 1.2)}>
        <path d="M62 66 q3 6 0 8 q-3 -2 0 -8 Z" />
        <path d="M140 70 q3 6 0 8 q-3 -2 0 -8 Z" />
        <path d="M104 52 q3 6 0 8 q-3 -2 0 -8 Z" />
      </g>
      {eyesClosed ? (
        <g stroke="#2B211C" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M73 86 Q80 90 87 86" />
          <path d="M113 86 Q120 90 127 86" />
        </g>
      ) : (
        <g fill="#2B211C">
          <ellipse cx="80" cy="84" rx="5" ry="5.5" />
          <ellipse cx="120" cy="84" rx="5" ry="5.5" />
        </g>
      )}
      <path
        d={anxious ? 'M70 70 L88 75 M112 75 L130 70' : 'M70 72 L88 70 M112 70 L130 72'}
        stroke="#2B211C"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M100 90 Q96 104 100 108"
        stroke="#A86F4C"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse
        cx="100"
        cy="124"
        rx={15 + lip * 6}
        ry={5 + lip * 5}
        fill={s('cyanosis') > 0.3 || arrest ? '#6A6F9A' : '#A9524C'}
      />
      <ellipse cx="100" cy="124" rx="7" ry={mouthOpen} fill="#3A1414" />
    </svg>
  );
}
