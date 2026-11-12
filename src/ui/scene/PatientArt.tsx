/** The patient in the bed and everything attached to them, for the bed scene. */
import type { CSSProperties } from 'react';
import type { Signs } from '../../engine/types.ts';
import type { BayState, BayTarget } from '../bay/bayModel.ts';
import { AvatarFace } from '../patient/Avatar.tsx';
import { Hot } from './BedArt.tsx';
import { GOWN, GOWN_DARK } from './sceneColors.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

interface PatientProps {
  state: BayState;
  signs: Signs;
  live: boolean;
  onPick: (t: BayTarget) => void;
}

/** The patient: head on the pillow, gown, arms on the blanket, and what's attached to them. */
export function PatientArt({ state, signs, live, onPick }: PatientProps) {
  const skin = hex(state.skin);
  const breathing = state.rr > 0 && !state.cpr;
  const breath: CSSProperties = {
    animationDuration: breathing ? `${(60 / state.rr).toFixed(2)}s` : '0s',
    animationPlayState: breathing ? 'running' : 'paused',
  };
  // Lying flat (arrest, very drowsy) sits the upper body lower in the bed.
  const drop = state.reclined ? 0 : 12;
  const faceSigns = state.eyesClosed ? { ...signs, eyesClosed: 1 } : signs;
  return (
    <g transform={`translate(0 ${drop})`}>
      <ellipse cx="400" cy="184" rx="78" ry="25" fill="#ffffff" stroke="#e1e7ea" />
      <Hot target="body" onPick={onPick}>
        <g className="scene-breath" style={breath}>
          <path
            d="M338 214 Q400 204 462 214 Q488 220 492 248 L468 316 L332 316 L308 248 Q312 220 338 214 Z"
            fill="url(#bs-gown)"
          />
          <path d="M384 210 L400 232 L416 210" fill="none" stroke={GOWN_DARK} strokeWidth="3" />
          {live && (
            <g className="electrodes">
              <circle cx="362" cy="238" r="4.5" fill="#fff" stroke="#8d989d" />
              <circle cx="438" cy="238" r="4.5" fill="#fff" stroke="#8d989d" />
              <circle cx="396" cy="288" r="4.5" fill="#fff" stroke="#8d989d" />
              <path
                d="M438 238 C 470 240, 500 260, 520 250 M396 288 C 440 300, 500 300, 524 292"
                fill="none"
                stroke="#9aa6ab"
                strokeWidth="1.4"
              />
            </g>
          )}
          {state.padsOn && (
            <g>
              <rect
                x="344"
                y="224"
                width="28"
                height="40"
                rx="5"
                fill="#2b2f33"
                stroke="#f08a24"
                strokeWidth="2"
                transform="rotate(-12 358 244)"
              />
              <rect
                x="434"
                y="258"
                width="28"
                height="40"
                rx="5"
                fill="#2b2f33"
                stroke="#f08a24"
                strokeWidth="2"
                transform="rotate(14 448 278)"
              />
            </g>
          )}
        </g>
        <path
          d="M312 300 L488 300 Q500 300 505 312 L566 384 Q570 394 556 394 L244 394 Q230 394 234 384 L295 312 Q300 300 312 300 Z"
          fill="url(#bs-blanket)"
        />
        <path d="M312 300 L488 300 Q500 300 503 310 L297 310 Q300 300 312 300 Z" fill="#d3dee5" />
        <ellipse cx="372" cy="378" rx="26" ry="13" fill="#c6d4dc" />
        <ellipse cx="428" cy="378" rx="26" ry="13" fill="#c6d4dc" />
        <path
          d="M330 330 Q360 344 352 372 M470 330 Q440 344 448 372"
          fill="none"
          stroke="#c3d0d8"
          strokeWidth="2"
        />
        {/* Arms over the blanket */}
        <path
          d="M318 236 Q300 262 302 282"
          stroke={GOWN}
          strokeWidth="30"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M482 236 Q500 262 498 282"
          stroke={GOWN}
          strokeWidth="30"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M302 284 Q300 316 312 338"
          stroke={skin}
          strokeWidth="21"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M498 284 Q500 316 488 338"
          stroke={skin}
          strokeWidth="21"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="314" cy="346" rx="13" ry="11" fill={skin} />
        <ellipse cx="486" cy="346" rx="13" ry="11" fill={skin} />
        {live && (
          <g>
            {/* BP cuff on the left upper arm, SpO2 probe on the right hand */}
            <path d="M312 248 Q304 260 303 272" stroke="#5b6b73" strokeWidth="32" fill="none" />
            <rect x="478" y="350" width="16" height="12" rx="3" fill="#e7ecef" stroke="#9aa6ab" />
            <circle cx="486" cy="356" r="2.6" fill="#ff4d4d" />
            <path
              d="M494 356 C 520 360, 540 350, 560 352"
              stroke="#9aa6ab"
              strokeWidth="1.6"
              fill="none"
            />
          </g>
        )}
        {state.ivAccess && (
          <g>
            <rect x="298" y="310" width="17" height="14" rx="2" fill="#fafbfb" stroke="#cfd6d9" />
            <rect x="303" y="314" width="8" height="5" rx="1.5" fill="#e66fa0" />
          </g>
        )}
      </Hot>
      <Hot target="head" onPick={onPick}>
        <g transform="translate(400 168) scale(0.6) translate(-100 -88)">
          <AvatarFace signs={faceSigns} arrest={state.arrest} />
        </g>
      </Hot>
      <OxygenArt kind={state.oxygen} />
      {state.cpr && (
        <g className="cpr-hands">
          <path d="M440 230 L470 196" stroke="#2f7f7a" strokeWidth="18" strokeLinecap="round" />
          <ellipse cx="404" cy="258" rx="24" ry="12" fill="#e0b18d" />
          <ellipse cx="402" cy="252" rx="22" ry="11" fill="#d7a37e" />
        </g>
      )}
    </g>
  );
}

function OxygenArt({ kind }: { kind: BayState['oxygen'] }) {
  if (!kind) return null;
  const tube = 'M366 182 C 330 214, 252 180, 206 118';
  if (kind === 'nasal') {
    return (
      <g fill="none" stroke="#8fd3a6" strokeWidth="2.6">
        <path d="M388 184 Q400 189 412 184 M388 184 Q372 188 366 172 M412 184 Q428 188 434 172" />
        <path d={tube} />
      </g>
    );
  }
  return (
    <g>
      <path
        d="M384 176 Q400 160 416 176 L414 196 Q400 206 386 196 Z"
        fill={kind === 'bvm' ? 'rgba(200,215,225,0.55)' : 'rgba(120,205,145,0.38)'}
        stroke={kind === 'bvm' ? '#8aa2b2' : '#3e9a62'}
        strokeWidth="2"
      />
      {kind === 'mask' && (
        <g>
          <ellipse
            cx="400"
            cy="222"
            rx="18"
            ry="12"
            fill="rgba(140,220,160,0.6)"
            stroke="#3e9a62"
            strokeWidth="1.5"
          />
          <path d={tube} fill="none" stroke="#8fd3a6" strokeWidth="3" />
        </g>
      )}
      {kind === 'bvm' && (
        <g>
          <path d="M412 178 L430 160" stroke="#8aa2b2" strokeWidth="6" />
          <ellipse
            className="bvm-bag"
            cx="458"
            cy="142"
            rx="36"
            ry="15"
            transform="rotate(-28 458 142)"
            fill="#5f86ab"
          />
        </g>
      )}
    </g>
  );
}
