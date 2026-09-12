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

const LOGO_SRC = "/penny-rats.jpg";

/**
 * Where the drawn frame actually sits inside the 2048px file, measured off the
 * pixels rather than guessed: the white margin runs 208 left, 228 right, 156 top and
 * 234 bottom, so the artwork is neither centred nor square. These numbers crop to the
 * largest square that contains no white, which trims about 23px from the top and
 * bottom of the black border — a bit over one percent, and invisible at any size the
 * mark is used.
 */
const CROP = { scale: 2048 / 1612, left: 0.129, top: 0.111, radius: 0.2 } as const;

/**
 * The Penny Rats mark.
 *
 * Renders the artwork from `public/penny-rats.jpg`. The source is a JPEG, so it has
 * no transparency and carries a white margin around its own rounded frame; the
 * wrapper crops that margin off so the mark sits directly on whatever is behind it.
 *
 * If the file is missing the coin below stands in — deliberately just the coin,
 * because a bad redrawing of the rat would read as a mistake where a plain coin
 * reads as a choice.
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
      <span
        className={`relative inline-block overflow-hidden ${className ?? ""}`}
        style={{ width: size, height: size, borderRadius: size * CROP.radius }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size local mark */}
        <img
          src={LOGO_SRC}
          alt="Penny Rats"
          className="absolute max-w-none"
          style={{
            width: size * CROP.scale,
            height: size * CROP.scale,
            left: -size * CROP.left,
            top: -size * CROP.top,
          }}
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      </span>
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
