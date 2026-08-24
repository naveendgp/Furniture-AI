/* Product configuration (NOT mock data) — the set of design styles the platform
   supports, with an accent color and a representative reference image for each.
   Real content (furniture, projects, renders) lives in the database. */

import type { Style } from "./types";

export type { Style };

const img = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const STYLES: Style[] = [
  "Modern",
  "Classical",
  "Luxury",
  "Minimal",
  "Scandinavian",
];

export const styleMeta: Record<
  Style,
  { dot: string; blurb: string; image: string }
> = {
  Modern: {
    dot: "#4f46e5",
    blurb: "Clean lines, bold forms",
    image: img("photo-1567016432779-094069958ea5"),
  },
  Classical: {
    dot: "#b45309",
    blurb: "Timeless & ornate",
    image: img("photo-1600210492493-0946911123ea"),
  },
  Luxury: {
    dot: "#9333ea",
    blurb: "Opulent materials",
    image: img("photo-1618220179428-22790b461013"),
  },
  Minimal: {
    dot: "#0ea5e9",
    blurb: "Less, but better",
    image: img("photo-1493809842364-78817add7ffb"),
  },
  Scandinavian: {
    dot: "#10b981",
    blurb: "Warm & functional",
    image: img("photo-1524758631624-e2822e304c36"),
  },
};
