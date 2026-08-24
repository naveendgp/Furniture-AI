"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Plus, FolderOpen, Sofa } from "lucide-react";
import { Page, stagger } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { SectionHeader, Skeleton } from "@/components/ui/primitives";
import { ProjectCard } from "@/components/project-card";
import { STYLES, styleMeta } from "@/lib/data";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { formatINR } from "@/lib/utils";

export default function DashboardPage() {
  const { data: projects, loading: projectsLoading } = useAsync(
    () => api.projects(),
    [],
  );
  const { data: products } = useAsync(() => api.products(), []);
  const recent = (projects ?? []).slice(0, 4);
  const topProducts = (products ?? []).slice(0, 3);

  return (
    <Page>
      {/* Welcome / hero card */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border p-8 lg:p-12 mb-10"
      >
        <div className="absolute inset-0 brand-gradient opacity-95" />
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/15 blur-2xl animate-float" />
        <div className="absolute right-24 bottom-0 h-40 w-40 rounded-full bg-accent-beige/30 blur-2xl" />
        <div className="relative max-w-2xl text-white">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-sm font-medium mb-5">
            <Sparkles className="h-4 w-4" /> Powered by Studio AI
          </span>
          <h1 className="text-[40px] lg:text-[52px] leading-[1.05] font-semibold tracking-tight">
            Design your dream space with AI
          </h1>
          <p className="text-white/80 text-lg mt-4 max-w-lg">
            Upload a photo of your room, pick a style, and watch beautiful,
            photorealistic designs come to life in seconds.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-7">
            <Link href="/new">
              <Button size="lg" className="!bg-white !text-gray-900 !shadow-lg hover:!brightness-100 hover:!bg-white/90">
                <Plus className="h-5 w-5" /> Create New Project
              </Button>
            </Link>
            <Link href="/library">
              <Button size="lg" variant="ghost" className="!text-white hover:!bg-white/15">
                <Sofa className="h-5 w-5" /> Browse Furniture
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Recent projects */}
      <section className="mb-12">
        <SectionHeader
          title="Recent Projects"
          subtitle="Pick up right where you left off"
          action={
            <Link href="/projects">
              <Button variant="secondary" size="sm">
                View all <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
        {projectsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : recent.length > 0 ? (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-5"
          >
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </motion.div>
        ) : (
          <EmptyTile
            icon={FolderOpen}
            title="No projects yet"
            body="Create your first design by uploading a room photo."
            cta="Create New Project"
            href="/new"
          />
        )}
      </section>

      {/* Browse by style (config, not content) */}
      <section className="mb-12">
        <SectionHeader
          title="Browse by Style"
          subtitle="Start a project from a design direction"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STYLES.map((style, i) => (
            <motion.div
              key={style}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href="/new"
                className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border"
              >
                <Image
                  src={styleMeta[style].image}
                  alt={style}
                  fill
                  sizes="20vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 p-4 text-white">
                  <p className="font-semibold text-lg tracking-tight">{style}</p>
                  <p className="text-white/80 text-[13px]">{styleMeta[style].blurb}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Marketplace picks (real products once uploaded) */}
      <section>
        <SectionHeader
          title="From the Marketplace"
          subtitle="Furniture ready to place in your rooms"
          action={
            <Link href="/library">
              <Button variant="secondary" size="sm">
                Browse all <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
        {topProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {topProducts.map((f) => (
              <Link
                href="/library"
                key={f.id}
                className="group flex gap-4 p-4 rounded-2xl border border-border bg-surface hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                  <Image src={f.thumbnailUrl} alt={f.name} fill sizes="80px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-subtle">{f.category}</p>
                  <p className="font-medium tracking-tight truncate">{f.name}</p>
                  <p className="text-primary font-semibold mt-1">{formatINR(f.priceInr)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyTile
            icon={Sofa}
            title="No furniture yet"
            body="Add 3D models from Settings → Upload 3D Model to fill the marketplace."
            cta="Upload a model"
            href="/settings"
          />
        )}
      </section>
    </Page>
  );
}

function EmptyTile({
  icon: Icon,
  title,
  body,
  cta,
  href,
}: {
  icon: typeof FolderOpen;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="grid place-items-center text-center py-14 rounded-2xl border border-dashed border-border-strong bg-surface/50">
      <div className="grid place-items-center h-14 w-14 rounded-2xl bg-surface-muted mb-4">
        <Icon className="h-6 w-6 text-subtle" />
      </div>
      <p className="font-semibold text-lg">{title}</p>
      <p className="text-muted mt-1 max-w-sm">{body}</p>
      <Link href={href} className="mt-5">
        <Button>
          <Plus className="h-4 w-4" /> {cta}
        </Button>
      </Link>
    </div>
  );
}
