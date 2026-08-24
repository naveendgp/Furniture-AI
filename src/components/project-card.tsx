"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { MoreHorizontal, Pencil, Clock } from "lucide-react";
import { styleMeta, type Style } from "@/lib/data";
import type { ProjectDTO } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { fadeUp } from "@/components/ui/page";
import { relativeTime } from "@/lib/utils";

export function ProjectCard({ project }: { project: ProjectDTO }) {
  const dot = styleMeta[project.style as Style]?.dot ?? "#4f46e5";
  return (
    <motion.div variants={fadeUp}>
      <Link href={`/studio?project=${project.id}`} className="group block">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)] transition-all duration-300 group-hover:shadow-[var(--shadow-lg)] group-hover:-translate-y-1">
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image
              src={project.thumbnailUrl}
              alt={project.name}
              fill
              sizes="(max-width:1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute top-3 left-3">
              <Badge dot={dot} className="glass !text-white !border-white/20">
                {project.style}
              </Badge>
            </div>
            <button
              aria-label="More actions"
              onClick={(e) => e.preventDefault()}
              className="absolute top-3 right-3 grid place-items-center h-9 w-9 rounded-xl glass !border-white/20 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            <div className="absolute bottom-3 right-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white text-gray-900 px-3 h-9 text-sm font-medium shadow-lg">
                <Pencil className="h-3.5 w-3.5" /> Open
              </span>
            </div>

            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
              <div
                className="h-full brand-gradient"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>

          <div className="p-4">
            <p className="font-medium tracking-tight truncate">{project.name}</p>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1.5 text-[13px] text-subtle">
                <Clock className="h-3.5 w-3.5" />
                {relativeTime(project.updatedAt)}
              </div>
              {project.itemCount > 0 && (
                <span className="text-[13px] text-subtle">
                  {project.itemCount} item{project.itemCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
