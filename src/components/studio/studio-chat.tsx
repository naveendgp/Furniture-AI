"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, ArrowUp, Plus, Wand2, RotateCcw } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ProductDTO } from "@/lib/types";

/* In-studio AI design chat.
   - Furniture requests are parsed with a lightweight keyword matcher and placed via
     the studio's add action.
   - Room-edit requests (wallpaper, curtains, paint, flooring) are sent to Gemini
     image editing; the edited photo becomes the project's new base image. */

type Msg = { id: number; role: "user" | "ai"; text: string; product?: ProductDTO; image?: string };

/** Detect a request to modify the room itself (surfaces), not add furniture. */
function isRoomEdit(t: string): boolean {
  if (/\b(wallpaper|curtains?|blinds?|drapes?|repaint|flooring)\b/.test(t)) return true;
  const feature = /\b(wall|walls|floor|ceiling|tiles?)\b/.test(t);
  const verb = /\b(paint|colou?r|change|make|remove|replace|new|swap)\b/.test(t);
  return feature && verb;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Seating: ["sofa", "couch", "chair", "armchair", "recliner", "loveseat", "seat", "seating", "bench", "stool"],
  Tables: ["table", "desk", "console", "nightstand", "coffee table", "dining table"],
  Lighting: ["lamp", "light", "lighting", "chandelier", "pendant", "sconce"],
  Storage: ["shelf", "bookshelf", "cabinet", "storage", "sideboard", "dresser", "wardrobe", "drawer"],
  Decor: ["rug", "carpet", "decor", "plant", "art", "mirror", "vase", "cushion"],
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, couple: 2, few: 3, pair: 2,
};

function parseQty(t: string): number {
  const digit = t.match(/\b([1-9])\b/);
  if (digit) return Math.min(4, Number(digit[1]));
  for (const [w, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return Math.min(4, n);
  }
  return 1;
}

function matchProduct(t: string, products: ProductDTO[]): ProductDTO | null {
  let best: ProductDTO | null = null;
  let bestScore = 0;
  for (const p of products) {
    let score = 0;
    for (const word of p.name.toLowerCase().split(/\s+/)) {
      if (word.length > 2 && t.includes(word)) score += 2;
    }
    const kws = CATEGORY_KEYWORDS[p.category] ?? [];
    if (kws.some((k) => t.includes(k))) score += 1.5;
    for (const s of p.styleTags) if (t.includes(s.toLowerCase())) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

function hasFurnitureWord(t: string, products: ProductDTO[]): boolean {
  const inCats = Object.values(CATEGORY_KEYWORDS).some((ks) => ks.some((k) => t.includes(k)));
  const inNames = products.some((p) =>
    p.name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && t.includes(w)),
  );
  return inCats || inNames;
}

export function StudioChat({
  products,
  onAdd,
  projectId,
  photoUrl,
  onRoomEdited,
  onRevert,
  edited,
}: {
  products: ProductDTO[];
  onAdd: (productId: string) => void;
  projectId?: string;
  photoUrl?: string;
  onRoomEdited?: (newPhotoUrl: string) => void;
  onRevert?: () => Promise<void> | void;
  edited?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, open]);

  const reply = (msg: Omit<Msg, "id" | "role">) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, { id: Date.now() + 1, role: "ai", ...msg }]);
    }, 750);
  };

  const send = async (text: string) => {
    const raw = text.trim();
    if (!raw || busy) return;
    const t = raw.toLowerCase();
    setMessages((m) => [...m, { id: Date.now(), role: "user", text: raw }]);
    setInput("");

    // Revert the room to its original photo.
    if (onRevert && /\b(revert|undo|reset|original)\b/.test(t) && /\b(room|wall|change|photo|edit|it)\b/.test(t)) {
      setBusy(true);
      setTyping(true);
      try {
        await onRevert();
        setTyping(false);
        setMessages((m) => [...m, { id: Date.now() + 1, role: "ai", text: "Reverted the room to its original photo." }]);
      } finally {
        setBusy(false);
        setTyping(false);
      }
      return;
    }

    // Room edit (wallpaper, curtains, paint, flooring…) — Gemini image editing.
    if (isRoomEdit(t)) {
      if (!projectId || !photoUrl || !onRoomEdited) {
        reply({ text: "I can edit the room once it's fully loaded — give it a moment and try again." });
        return;
      }
      setBusy(true);
      setTyping(true);
      try {
        const newUrl = await api.editRoom(projectId, photoUrl, raw);
        onRoomEdited(newUrl);
        setTyping(false);
        setMessages((m) => [
          ...m,
          {
            id: Date.now() + 1,
            role: "ai",
            text: `Done — I've updated the room (“${raw}”). This is now your base image, so any furniture you add or render sits on the new look. Ask for another change, or start adding furniture.`,
            image: newUrl,
          },
        ]);
      } catch (e) {
        setTyping(false);
        const err = e as { code?: string };
        setMessages((m) => [
          ...m,
          {
            id: Date.now() + 1,
            role: "ai",
            text:
              err.code === "billing"
                ? "Room editing needs billing enabled on the Gemini API key."
                : "I couldn't edit the room just now — the AI image service may be busy. Please try that again.",
          },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Ambient lighting change (not adding a lamp) — not built yet.
    if (/\b(warmer|dimmer|brighter|cozier|cozy|mood|ambient)\b/.test(t) && /\blight/.test(t)) {
      reply({
        text: "Ambient lighting adjustments are coming soon. I can place a lamp if you have one — try “add a lamp”.",
      });
      return;
    }

    if (products.length === 0) {
      reply({
        text: "Your marketplace is empty. Upload a 3D model in Settings → Upload 3D Model, then I can place it for you.",
      });
      return;
    }

    const product = matchProduct(t, products);
    if (product) {
      const qty = parseQty(t);
      for (let i = 0; i < qty; i++) onAdd(product.id);
      reply({
        text:
          qty > 1
            ? `Done — I've added ${qty} × ${product.name} to your room. They'll stack at the centre; drag them apart or ask for more.`
            : `Done — I've placed a ${product.name} in your room and selected it. Drag to reposition, or ask for another piece.`,
        product,
      });
      return;
    }

    if (hasFurnitureWord(t, products)) {
      reply({
        text: `I couldn't find that in your marketplace. You have: ${products
          .map((p) => p.name)
          .join(", ")}. Try “add ${products[0].name}”.`,
      });
    } else {
      reply({
        text: `Tell me what to place — e.g. “add a sofa” or “add ${products[0].name}”. I'll pull it straight from your marketplace.`,
      });
    }
  };

  const restyleActions = onRoomEdited
    ? ["Change the wallpaper to warm beige", "Remove the curtains", "Change the flooring to wood"]
    : [];
  const furnitureActions = products.slice(0, 3);
  const empty = messages.length === 0;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="absolute bottom-6 right-6 z-30 flex items-center gap-2.5 h-12 pl-2 pr-4 rounded-full bg-surface/90 backdrop-blur-xl border border-border shadow-[var(--shadow-lg)] hover:border-primary/40 transition-all"
          >
            <span className="grid place-items-center h-8 w-8 rounded-full brand-gradient text-white shrink-0">
              <Sparkles className="h-[18px] w-[18px]" />
            </span>
            <span className="font-medium text-sm hidden sm:block">Design with AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-6 right-6 z-30 flex flex-col w-[min(400px,calc(100%-2rem))] h-[min(600px,calc(100%-6.5rem))] rounded-[26px] bg-surface/95 backdrop-blur-2xl border border-border shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 h-14 border-b border-border/70 shrink-0">
              <span className="grid place-items-center h-8 w-8 rounded-full brand-gradient text-white shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold tracking-tight leading-tight text-[15px]">AI Designer</p>
                <p className="text-[11px] text-subtle leading-tight tracking-wide">Restyle · Furniture · Render</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid place-items-center h-8 w-8 rounded-full text-muted hover:bg-surface-muted transition-colors"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Edited-room banner with one-tap revert */}
            {edited && onRevert && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border shrink-0">
                <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs text-muted flex-1 min-w-0 truncate">Room has AI edits applied</span>
                <button
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    setTyping(true);
                    try {
                      await onRevert();
                      setMessages((m) => [...m, { id: Date.now(), role: "ai", text: "Reverted the room to its original photo." }]);
                    } finally {
                      setBusy(false);
                      setTyping(false);
                    }
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className="h-3 w-3" /> Revert
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {empty ? (
                <div className="h-full flex flex-col">
                  <div className="grid place-items-center h-11 w-11 rounded-2xl brand-gradient text-white mx-auto mb-3 mt-2">
                    <Sparkles className="h-[22px] w-[22px]" />
                  </div>
                  <p className="text-center font-semibold">How should we design this room?</p>
                  <p className="text-center text-[13px] text-muted mt-1 mb-4">
                    Restyle the room or place furniture — just ask.
                  </p>

                  {restyleActions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle mb-2 flex items-center gap-1.5">
                        <Wand2 className="h-3 w-3" /> Restyle the room
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {restyleActions.map((label) => (
                          <button
                            key={label}
                            onClick={() => send(label)}
                            className="px-2.5 h-8 rounded-full border border-border bg-surface text-xs font-medium hover:border-primary/50 hover:bg-primary/5 transition-colors"
                          >
                            {label.replace(/^(Change the |Remove the )/, "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {furnitureActions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle mb-2 flex items-center gap-1.5">
                        <Plus className="h-3 w-3" /> Add furniture
                      </p>
                      <div className="space-y-1.5">
                        {furnitureActions.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => send(`Add ${p.name}`)}
                            className="w-full flex items-center gap-2.5 p-1.5 rounded-xl border border-border bg-surface text-left hover:bg-surface-muted transition-colors"
                          >
                            <span className="relative h-8 w-8 rounded-lg overflow-hidden shrink-0 bg-surface-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                            </span>
                            <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-primary font-semibold shrink-0 pr-1">{formatINR(p.priceInr)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <Bubble key={m.id} msg={m} />
                  ))}
                  {typing && <Typing label={busy ? "Editing the room… (~15–25s)" : undefined} />}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <div className="px-4 pb-4 pt-2 shrink-0">
              <div className="flex items-end gap-2 pl-4 pr-1.5 py-1.5 rounded-2xl bg-surface-muted border border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                <textarea
                  rows={1}
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder={busy ? "Working…" : "Describe a change or a piece to add…"}
                  aria-label="Message"
                  className="flex-1 resize-none bg-transparent py-2 outline-none text-sm placeholder:text-subtle max-h-24 disabled:opacity-60"
                />
                <button
                  aria-label="Send"
                  onClick={() => send(input)}
                  disabled={!input.trim() || busy}
                  className="grid place-items-center h-9 w-9 rounded-xl brand-gradient text-white shadow-[var(--shadow-glow)] disabled:opacity-40 disabled:shadow-none transition-all shrink-0 active:scale-95"
                >
                  <ArrowUp className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  // User prompts sit right as subtle chips; the AI replies as clean editorial blocks
  // with a small gradient mark — no bright "chat app" bubbles.
  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-md bg-surface-muted text-foreground text-sm leading-relaxed">
          {msg.text}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
      <span className="grid place-items-center h-6 w-6 rounded-full brand-gradient text-white shrink-0 mt-0.5">
        <Sparkles className="h-3 w-3" />
      </span>
      <div className="max-w-[85%] min-w-0">
        <div className="text-sm leading-relaxed text-foreground">{msg.text}</div>
        {msg.image && (
          <div className="mt-2 rounded-xl overflow-hidden border border-border w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.image} alt="Updated room" className="w-full aspect-[4/3] object-cover" />
          </div>
        )}
        {msg.product && (
          <div className="mt-2 flex items-center gap-2.5 p-2 rounded-xl border border-border bg-surface w-full">
            <span className="relative h-10 w-10 rounded-lg overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={msg.product.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">{msg.product.name}</span>
              <span className="block text-xs text-primary font-semibold">
                {formatINR(msg.product.priceInr)}
              </span>
            </span>
            <span className="grid place-items-center h-6 w-6 rounded-full bg-emerald-500 text-white shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Typing({ label }: { label?: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="grid place-items-center h-6 w-6 rounded-full brand-gradient text-white shrink-0 mt-0.5">
        <Sparkles className="h-3 w-3" />
      </span>
      <div className="flex items-center gap-2 py-1">
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
        {label && <span className="text-xs text-muted">{label}</span>}
      </div>
    </div>
  );
}
