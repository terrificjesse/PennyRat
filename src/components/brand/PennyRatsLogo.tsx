"use client";

import { useState } from "react";

type LogoProps = {
  /** Rendered size in pixels. The artwork is square. */
  size?: number;
  /** Drops the wordmark from the fallback, for the small header version. */
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
};

const LOGO_SRC = "/penny-rats.png";

/**
 * The Penny Rats mark.
 *
 * Renders the artwork from `public/penny-rats.png`. If that file is missing the
 * coin below stands in — deliberately just the coin, because a bad redrawing of the
 * rat would read as a mistake where a plain coin reads as a choice.
 */
export function PennyRatsLogo({
  size = 96,
  showWordmark = true,
  className,
  priority = false,
}: LogoProps) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a fixed-size local mark
      <img
        src={LOGO_SRC}
        alt="Penny Rats"
        width={size}
        height={size}
        className={className}
        loading={priority ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    );
  }

  return <CoinMark size={size} showWordmark={showWordmark} className={className} />;
}

function CoinMark({ size, showWordmark, className }: Omit<LogoProps, "priority">) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Penny Rats"
    >
      <rect
        x="6"
        y="6"
        width="188"
        height="188"
        rx="34"
        fill="#4f5786"
        stroke="#141414"
        strokeWidth="9"
      />
      <path
        d="M28 104c0-20 32-35 72-35s72 15 72 35v14c0 20-32 35-72 35s-72-15-72-35z"
        fill="#e9c98a"
        stroke="#141414"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <ellipse
        cx="100"
        cy="104"
        rx="72"
        ry="35"
        fill="#faeecd"
        stroke="#141414"
        strokeWidth="6"
      />
      {showWordmark && (
        <text
          x="100"
          y="112"
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          fill="#141414"
          fontFamily="var(--font-geist-sans), ui-rounded, system-ui, sans-serif"
        >
          Penny Rats
        </text>
      )}
    </svg>
  );
}
