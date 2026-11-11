/** Small line icons, drawn for this app (24×24, stroke uses currentColor). */
import type { ReactNode } from 'react';

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconBook = (p: P) => (
  <Icon {...p}>
    <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5c-.8 0-1.5.6-1.5 1.4V5.5Z" />
    <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5.6 1.5 1.4V5.5Z" />
  </Icon>
);

export const IconPatient = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6" />
    <path d="M17 6.5a2.5 2.5 0 1 1 3 2.4c-.6.2-1 .7-1 1.3v.6" />
    <path d="M19 14h.01" />
  </Icon>
);

export const IconShuffle = (p: P) => (
  <Icon {...p}>
    <path d="M3 7h3.5c2.5 0 3.7 1.4 5 5s2.5 5 5 5H21" />
    <path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4C15.1 7.5 16.1 7 17.5 7H21" />
    <path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
  </Icon>
);

export const IconPulse = (p: P) => (
  <Icon {...p}>
    <path d="M2 12h4l2-5 4 11 3-8 2 2h5" />
  </Icon>
);

export const IconChat = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16v10H9l-5 4V5Z" />
    <path d="M8 9h8M8 12h5" />
  </Icon>
);

export const IconChart = (p: P) => (
  <Icon {...p}>
    <path d="M4 4v16h16" />
    <path d="m7 14 3-4 3 3 5-6" />
  </Icon>
);

export const IconCode = (p: P) => (
  <Icon {...p}>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
  </Icon>
);

export const IconEdit = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const IconCompare = (p: P) => (
  <Icon {...p}>
    <path d="M3 17c3-1 4-8 7-8s3 5 6 5 3-4 5-5" />
    <path d="M3 13c3 0 4-4 7-4" strokeDasharray="2 2.5" />
    <path d="M3 21h18" />
  </Icon>
);

export const IconVideo = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="m16 10 5-3v10l-5-3" />
  </Icon>
);

export const IconArrow = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
