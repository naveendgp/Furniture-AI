"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("px-5 lg:px-8 py-7 max-w-[1400px] mx-auto", className)}
    >
      {children}
    </motion.div>
  );
}

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};
