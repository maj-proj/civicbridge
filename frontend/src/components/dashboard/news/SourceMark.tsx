import { hash } from "@/lib/news/normalize";
import { cn } from "@/lib/utils";

/**
 * A publisher's letter mark.
 *
 * Favicons would be prettier but mean an image request per card to a
 * third party, with a broken tile whenever one 404s. A mark derived from the
 * domain is deterministic, renders instantly and gives a wall of headlines
 * the colour variation it needs to be scannable.
 */
export function SourceMark({
  source,
  domain,
  className,
}: {
  source: string;
  domain: string | null;
  className?: string;
}) {
  const hue = hueFor(domain ?? source);

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-tight",
        className
      )}
      style={{
        backgroundColor: `oklch(0.93 0.045 ${hue})`,
        color: `oklch(0.42 0.1 ${hue})`,
      }}
    >
      {initials(source)}
    </span>
  );
}

/** The same hue the ticker uses for a publisher's dot. */
export function hueFor(key: string): number {
  return Number.parseInt(hash(key), 36) % 360;
}

function initials(source: string): string {
  const words = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "??";

  // Skip the filler words mastheads are full of: "The Times of India" -> TI.
  const meaningful = words.filter(
    (word) => !["the", "of", "and", "news", "com"].includes(word.toLowerCase())
  );
  const chosen = meaningful.length > 0 ? meaningful : words;

  return (chosen.length === 1
    ? chosen[0].slice(0, 2)
    : chosen[0][0] + chosen[1][0]
  ).toUpperCase();
}
