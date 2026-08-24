"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic, ArrowUp, Sofa, Sun, Wand2, IndianRupee } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { ProductDTO } from "@/lib/types";

type Msg = {
  id: number;
  role: "user" | "ai";
  text: string;
  cards?: ProductDTO[];
};

const prompts = [
  { icon: Wand2, text: "Make this room modern" },
  { icon: Sun, text: "Add warm lighting" },
  { icon: Sofa, text: "Replace sofa with classical design" },
  { icon: IndianRupee, text: "Keep budget under ₹2 Lakhs" },
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: products } = useAsync(() => api.products(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: Date.now(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    const picks = (products ?? []).slice(0, 3);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "ai",
          text:
            picks.length > 0
              ? "Beautiful choice! Here's how I'd refresh the space. I've picked pieces from your marketplace that match the vibe — tap any to drop it into your studio."
              : "Great direction! Once you've added furniture to the marketplace (Settings → Upload 3D Model), I'll suggest specific pieces you can drop straight into the room.",
          cards: picks.length > 0 ? picks : undefined,
        },
      ]);
    }, 1400);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100svh-68px)] lg:h-[calc(100svh-68px)] max-w-3xl mx-auto w-full px-5 lg:px-8">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto py-8">
        {empty ? (
          <div className="h-full grid place-items-center text-center">
            <div>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="grid place-items-center h-16 w-16 rounded-2xl brand-gradient text-white shadow-[var(--shadow-glow)] mx-auto mb-5"
              >
                <Sparkles className="h-8 w-8" />
              </motion.div>
              <h1 className="text-3xl font-semibold tracking-tight">
                How can I help you design?
              </h1>
              <p className="text-muted mt-2.5 max-w-md mx-auto">
                Describe what you want in plain words — I'll suggest furniture,
                lighting, and styles you can apply with one tap.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-8 max-w-xl mx-auto">
                {prompts.map((p) => (
                  <button
                    key={p.text}
                    onClick={() => send(p.text)}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-surface text-left hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
                  >
                    <span className="grid place-items-center h-9 w-9 rounded-xl bg-surface-muted text-primary shrink-0">
                      <p.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="text-[15px] font-medium">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} />
            ))}
            {typing && <Typing />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="pb-6 pt-2">
        <div className="relative flex items-end gap-2 p-2 rounded-3xl border border-border bg-surface shadow-[var(--shadow-md)]">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask anything about your room…"
            aria-label="Message"
            className="flex-1 resize-none bg-transparent px-4 py-3 outline-none text-[15px] placeholder:text-subtle max-h-32"
          />
          <button
            aria-label="Voice input"
            className="grid place-items-center h-11 w-11 rounded-2xl text-muted hover:bg-surface-muted transition-colors shrink-0"
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            aria-label="Send"
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="grid place-items-center h-11 w-11 rounded-2xl brand-gradient text-white shadow-[var(--shadow-glow)] disabled:opacity-40 disabled:shadow-none transition-all shrink-0 active:scale-95"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      {!isUser && (
        <span className="grid place-items-center h-9 w-9 rounded-xl brand-gradient text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </span>
      )}
      <div className={cn("max-w-[80%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "px-4 py-3 text-[15px] leading-relaxed",
            isUser
              ? "brand-gradient text-white rounded-2xl rounded-tr-md"
              : "bg-surface border border-border rounded-2xl rounded-tl-md",
          )}
        >
          {msg.text}
        </div>
        {msg.cards && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 w-full">
            {msg.cards.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-surface overflow-hidden hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <div className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.thumbnailUrl} alt={c.name} className="h-full w-full object-cover" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-primary text-sm font-semibold">{formatINR(c.priceInr)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Typing() {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
        <span className="grid place-items-center h-9 w-9 rounded-xl brand-gradient text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex items-center gap-1.5 px-4 py-4 bg-surface border border-border rounded-2xl rounded-tl-md">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-muted"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
