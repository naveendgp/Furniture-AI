"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, LayoutGrid, FolderOpen } from "lucide-react";
import { Page, stagger } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { ProjectCard } from "@/components/project-card";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";

export default function ProjectsPage() {
  const { data, loading } = useAsync(() => api.projects(), []);
  const projects = data ?? [];

  return (
    <Page>
      <div className="flex items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My Projects</h1>
          <p className="text-muted mt-1.5">
            {loading ? "Loading…" : `${projects.length} designs in progress`}
          </p>
        </div>
        <Link href="/new">
          <Button>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <button className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-surface-muted text-foreground text-sm font-medium border border-border">
          <LayoutGrid className="h-4 w-4" /> All
        </button>
        {["Living Room", "Bedroom", "Dining"].map((t) => (
          <button
            key={t}
            className="h-9 px-3.5 rounded-xl text-muted hover:text-foreground hover:bg-surface-muted text-sm font-medium transition-colors"
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : projects.length > 0 ? (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </motion.div>
      ) : (
        <EmptyState />
      )}
    </Page>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="grid place-items-center h-20 w-20 rounded-3xl bg-surface-muted mb-5">
        <FolderOpen className="h-9 w-9 text-subtle" />
      </div>
      <h3 className="text-xl font-semibold tracking-tight">No projects yet</h3>
      <p className="text-muted mt-1.5 max-w-sm">
        Start your first design by uploading a photo of any room — it only takes
        a minute.
      </p>
      <Link href="/new" className="mt-6">
        <Button>
          <Plus className="h-4 w-4" /> Create your first project
        </Button>
      </Link>
    </div>
  );
}
