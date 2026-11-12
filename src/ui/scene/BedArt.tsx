/**
 * The resus bay seen from the foot of the bed: room, bed, patient and the
 * equipment that appears as it's used. Pure SVG drawing in an 800×450 box;
 * BedScene decides what to show and what clicking does.
 */
import type { ReactNode } from 'react';
import type { BayTarget } from '../bay/bayModel.ts';
import { TARGET_LABELS } from '../bay/bayModel.ts';
import { GOWN, GOWN_DARK } from './sceneColors.ts';

/** A clickable part of the scene. Keyboard users use the matching buttons under the scene. */
export function Hot({
  target,
  onPick,
  children,
}: {
  target: BayTarget;
  onPick: (t: BayTarget) => void;
  children: ReactNode;
}) {
  return (
    <g className="hot" data-target={target} onClick={() => onPick(target)}>
      <title>{TARGET_LABELS[target]}</title>
      {children}
    </g>
  );
}

export function Defs() {
  return (
    <defs>
      <linearGradient id="bs-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eef3f4" />
        <stop offset="1" stopColor="#e1e9eb" />
      </linearGradient>
      <linearGradient id="bs-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d3dbde" />
        <stop offset="1" stopColor="#c3ccd0" />
      </linearGradient>
      <linearGradient id="bs-sheet" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f8fafb" />
        <stop offset="1" stopColor="#e9eef1" />
      </linearGradient>
      <linearGradient id="bs-blanket" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dfe8ee" />
        <stop offset="1" stopColor="#cbd8e0" />
      </linearGradient>
      <pattern id="bs-gown" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill={GOWN} />
        <circle cx="2.5" cy="2.5" r="1.3" fill={GOWN_DARK} />
        <circle cx="7.5" cy="7.5" r="1.3" fill={GOWN_DARK} />
      </pattern>
    </defs>
  );
}

export function Room({ bay, onPick }: { bay: number | null; onPick: (t: BayTarget) => void }) {
  return (
    <g>
      <rect width="800" height="330" fill="url(#bs-wall)" />
      <rect y="330" width="800" height="120" fill="url(#bs-floor)" />
      <rect y="322" width="800" height="9" fill="#c6d0d4" />
      {/* Bed-head unit with the bay number above the bed */}
      <rect x="246" y="40" width="308" height="64" rx="10" fill="#e4ebee" stroke="#d0d9dd" />
      <rect x="352" y="50" width="96" height="34" rx="6" fill="#1f4f57" />
      <text x="400" y="73" textAnchor="middle" className="bay-sign">
        {bay ? `BAY ${bay}` : 'RESUS'}
      </text>
      {/* Medical gas rail */}
      <rect x="150" y="100" width="500" height="18" rx="5" fill="#d2dbdf" stroke="#bcc7cb" />
      <Hot target="oxygen" onPick={onPick}>
        <rect x="186" y="92" width="72" height="34" rx="6" fill="transparent" />
        <circle cx="206" cy="109" r="8" fill="#fff" stroke="#2f7d55" strokeWidth="3" />
        <text x="222" y="114" className="gas-label">
          O₂
        </text>
        <circle cx="246" cy="109" r="6" fill="#fff" stroke="#6b767b" strokeWidth="2.5" />
      </Hot>
      <circle cx="590" cy="109" r="7" fill="#fff" stroke="#d7a100" strokeWidth="3" />
      <rect x="580" y="118" width="20" height="34" rx="4" fill="#e9f1f4" stroke="#b8c6cc" />
      <rect x="582" y="138" width="16" height="12" rx="2" fill="#d6e4ea" />
    </g>
  );
}

export function WallMonitor({
  hr,
  spo2,
  bp,
  onPick,
}: {
  hr: string;
  spo2: string;
  bp: string;
  onPick: (t: BayTarget) => void;
}) {
  return (
    <Hot target="monitor" onPick={onPick}>
      <path d="M700 0 L700 22" stroke="#9aa6ab" strokeWidth="6" />
      <rect
        x="606"
        y="20"
        width="160"
        height="96"
        rx="9"
        fill="#070b0c"
        stroke="#2e383d"
        strokeWidth="6"
      />
      <polyline
        points="616,44 636,44 640,38 644,44 652,44 656,48 660,28 664,54 668,44 690,44 694,40 700,44 720,44 724,48 728,28 732,54 736,44 756,44"
        fill="none"
        stroke="#3ce07a"
        strokeWidth="1.6"
      />
      <text x="618" y="84" className="wm-num hr">
        {hr}
      </text>
      <text x="694" y="84" className="wm-num spo2">
        {spo2}
      </text>
      <text x="618" y="106" className="wm-small bp">
        {bp}
      </text>
    </Hot>
  );
}

export function DripStand({ drip, onPick }: { drip: boolean; onPick: (t: BayTarget) => void }) {
  return (
    <>
      <Hot target="iv" onPick={onPick}>
        <g transform="translate(34 0)">
          <rect x="96" y="90" width="64" height="356" fill="transparent" />
          <line x1="128" y1="96" x2="128" y2="424" stroke="#9aa6ab" strokeWidth="5" />
          <line x1="108" y1="98" x2="148" y2="98" stroke="#9aa6ab" strokeWidth="4" />
          <path
            d="M128 424 L100 438 M128 424 L156 438 M128 424 L128 442"
            stroke="#8a969b"
            strokeWidth="5"
          />
          <circle cx="100" cy="440" r="4" fill="#4c565b" />
          <circle cx="156" cy="440" r="4" fill="#4c565b" />
          {drip && (
            <g>
              <rect
                x="110"
                y="104"
                width="36"
                height="62"
                rx="8"
                fill="#eaf6fb"
                stroke="#a9c6d3"
                strokeWidth="2"
              />
              <rect x="113" y="120" width="30" height="43" rx="6" fill="#bfe3f2" />
              <rect x="116" y="110" width="24" height="6" rx="2" fill="#6aa9c4" />
              <rect x="124" y="166" width="8" height="18" rx="3" fill="#dff1f8" stroke="#a9c6d3" />
            </g>
          )}
        </g>
      </Hot>
    </>
  );
}

/** The giving set from the bag to the cannula, drawn over the bed rail. */
export function IvLine({ drop }: { drop: number }) {
  return (
    <path
      d={`M162 184 C 180 290, 240 ${330 + drop}, 304 ${318 + drop}`}
      fill="none"
      stroke="#9fc8da"
      strokeWidth="2.5"
    />
  );
}

export function CrashTrolley({ onPick }: { onPick: (t: BayTarget) => void }) {
  return (
    <Hot target="cart" onPick={onPick}>
      <rect x="606" y="250" width="124" height="14" rx="4" fill="#b9c3c8" />
      <rect x="626" y="212" width="84" height="40" rx="6" fill="#3b4448" />
      <rect x="634" y="220" width="32" height="22" rx="3" fill="#0f2a18" />
      <polyline
        points="636,234 644,234 647,226 650,240 653,234 664,234"
        fill="none"
        stroke="#3ce07a"
        strokeWidth="1.5"
      />
      <rect x="674" y="222" width="28" height="8" rx="2" fill="#f2c84b" />
      <rect x="612" y="262" width="112" height="158" rx="7" fill="#d5473a" />
      {[296, 328, 360, 392].map((y) => (
        <g key={y}>
          <line x1="616" y1={y} x2="720" y2={y} stroke="#e56a5e" strokeWidth="3" />
          <rect x="656" y={y - 18} width="24" height="5" rx="2" fill="#f2b3ab" />
        </g>
      ))}
      <circle cx="626" cy="428" r="7" fill="#4c565b" />
      <circle cx="710" cy="428" r="7" fill="#4c565b" />
    </Hot>
  );
}

export function Bed({ children }: { children: ReactNode }) {
  return (
    <g>
      <ellipse cx="400" cy="438" rx="236" ry="12" fill="rgba(0,0,0,0.08)" />
      <rect x="290" y="120" width="220" height="58" rx="12" fill="#c5d0d5" stroke="#aeb9be" />
      <rect x="304" y="130" width="192" height="36" rx="8" fill="#d2dbdf" />
      <path d="M296 176 L504 176 L590 388 L210 388 Z" fill="url(#bs-sheet)" stroke="#dbe2e6" />
      <path d="M210 388 L590 388 L582 404 L218 404 Z" fill="#b6c1c6" />
      {children}
      {/* Side rails */}
      <path d="M286 208 L214 356" stroke="#a9b4b9" strokeWidth="7" strokeLinecap="round" />
      <path d="M514 208 L586 356" stroke="#a9b4b9" strokeWidth="7" strokeLinecap="round" />
      <path
        d="M262 256 L254 272 M240 300 L232 316 M538 256 L546 272 M560 300 L568 316"
        stroke="#a9b4b9"
        strokeWidth="5"
      />
      {/* Footboard with the patient's chart */}
      <rect x="196" y="384" width="408" height="44" rx="12" fill="#cdd7db" stroke="#b7c2c7" />
      <rect x="378" y="390" width="44" height="34" rx="3" fill="#fbfcfc" stroke="#c9d1d5" />
      <rect x="392" y="387" width="16" height="6" rx="2" fill="#5b6870" />
      <path d="M384 402 H416 M384 409 H416 M384 416 H406" stroke="#c3cdd2" strokeWidth="2" />
      <rect x="232" y="428" width="336" height="10" rx="4" fill="#9aa6ac" />
      <circle cx="252" cy="442" r="7" fill="#4c565b" />
      <circle cx="548" cy="442" r="7" fill="#4c565b" />
    </g>
  );
}
