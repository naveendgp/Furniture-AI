"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { Wallet, TrendingDown, Plus } from "lucide-react";
import { Page } from "@/components/ui/page";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { formatINR, formatINRFull } from "@/lib/utils";

const BUDGET = 200000;
const COLORS = ["#4f46e5", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

export default function BudgetPage() {
  const { data: budget, loading } = useAsync(() => api.budget(), []);

  const items = budget?.items ?? [];
  const pieData = budget?.byCategory ?? [];
  const spent = budget?.total ?? 0;
  const remaining = BUDGET - spent;
  const pct = Math.round((spent / BUDGET) * 100);

  return (
    <Page>
      <div className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight">Budget Planner</h1>
        <p className="text-muted mt-1.5">
          {budget
            ? `Tracking "${budget.projectName}" — every piece you've placed`
            : "Track every piece and stay within your target"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <StatCard
          icon={Wallet}
          label="Total budget"
          value={formatINRFull(BUDGET)}
          tint="from-primary to-accent-purple"
        />
        <StatCard
          icon={TrendingDown}
          label="Spent so far"
          value={loading ? "…" : formatINRFull(spent)}
          sub={`${pct}% used`}
          tint="from-pink-500 to-rose-500"
        />
        <StatCard
          icon={Wallet}
          label="Remaining"
          value={loading ? "…" : formatINRFull(remaining)}
          sub={remaining < 0 ? "Over budget" : "On track"}
          tint="from-emerald-500 to-teal-500"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold tracking-tight">Cost breakdown</h2>
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted">Budget utilization</span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <div className="h-3 rounded-full bg-surface-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pct, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full brand-gradient"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="divide-y divide-border">
                {items.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-subtle">{item.category}</p>
                      </div>
                    </div>
                    <span className="font-semibold">{formatINR(item.priceInr)}</span>
                  </motion.div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-semibold text-primary">
                  {formatINRFull(spent)}
                </span>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-muted">
              No furniture added yet. Place items in the studio to track cost.
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2 p-6">
          <h2 className="text-lg font-semibold tracking-tight mb-2">By category</h2>
          <div className="relative h-64">
            {!loading && pieData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => formatINRFull(v)}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--foreground)",
                      boxShadow: "var(--shadow-md)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <p className="text-xs text-subtle">Spent</p>
                <p className="text-2xl font-semibold">{formatINR(spent)}</p>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {d.name}
                </span>
                <span className="font-medium">{formatINR(d.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <Card className="p-5 overflow-hidden relative">
      <div className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${tint} text-white mb-4`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs text-subtle mt-1">{sub}</p>}
    </Card>
  );
}
