// A plain img: next/image would send the stored PNG through its optimiser.
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

export function Screenshot({
  url,
  width,
  scale = 1,
  alt,
  testId,
  className = "",
  style,
}: {
  url: string;
  width: number;
  scale?: number;
  alt: string;
  testId: string;
  className?: string;
  style?: CSSProperties;
}) {
  const height = width === 320 ? 256 : 192;
  return (
    <img
      src={url}
      alt={alt}
      width={width * scale}
      height={height * scale}
      className={`mw-100 h-auto ${className}`}
      style={{ imageRendering: "pixelated", ...style }}
      data-testid={testId}
    />
  );
}
