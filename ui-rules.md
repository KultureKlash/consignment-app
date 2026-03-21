# UI Rules (Preserve Lovable Style)

## Core Principle

* DO NOT change the visual identity
* DO NOT redesign the UI
* Only improve execution and polish

---

## Style Preservation

* Keep the existing layout structure exactly the same
* Keep spacing style and density consistent
* Keep the same color palette and tone
* Do not introduce new design systems or themes

---

## Improvements Allowed

* Improve spacing consistency (cleaner gaps, alignment)
* Improve typography hierarchy (clearer titles vs body)
* Enhance readability and clarity
* Add subtle polish (hover states, transitions)

---

## Components

* Keep the current component structure
* Do not replace components with completely different designs
* Only refine visuals (padding, alignment, emphasis)

---

## Visual Hierarchy

* Make important elements slightly more prominent
* Reduce visual flatness where needed
* Avoid making everything look identical in weight

---

## Interactions

* Add subtle hover and transition effects
* Keep interactions minimal and clean

---

## What to Avoid

* No full redesigns
* No drastic color changes
* No adding heavy shadows or flashy effects
* No changing the overall vibe

---

## Goal

* Make the UI feel more polished, refined, and intentional
* Keep the original Lovable design, just elevate it



## Here are the codes! 

## 1.Index.tsx

import { motion } from "framer-motion";
import { Package, ShoppingBag, Clock, AlertCircle, History } from "lucide-react";
import StatsCard from "@/components/StatsCard";
import ActionItem from "@/components/ActionItem";
import ActivityItem from "@/components/ActivityItem";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const Index = () => (
  <div className="min-h-screen bg-background p-4 sm:p-8 font-sans text-foreground antialiased">
    <div className="max-w-7xl mx-auto">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your consignment ecosystem.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Last Updated</p>
          <p className="text-sm font-medium text-foreground tabular-nums">12:42 PM</p>
        </div>
      </header>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Active Listings", value: "1,284", icon: Package, trend: "+12%" },
            { label: "Items Sold Today", value: "42", icon: ShoppingBag, trend: "+8%" },
            { label: "Pending Payouts", value: "$14,290.00", icon: Clock },
            { label: "Low Stock Alerts", value: "18", icon: AlertCircle },
          ].map((s) => (
            <motion.div key={s.label} variants={itemVariants}>
              <StatsCard {...s} />
            </motion.div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <motion.section variants={itemVariants} className="lg:col-span-5">
            <div className="bg-card border border-border/60 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Action Required</h2>
                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-full border border-rose-100">
                  62 Total
                </span>
              </div>
              <div className="p-2 space-y-1">
                <ActionItem label="Awaiting Approval" count={24} colorClass="bg-blue-500" />
                <ActionItem label="Awaiting Drop-off" count={31} colorClass="bg-amber-500" />
                <ActionItem label="Withdrawal Requests" count={7} colorClass="bg-emerald-500" />
              </div>
            </div>
          </motion.section>

          <motion.section variants={itemVariants} className="lg:col-span-7">
            <div className="bg-card border border-border/60 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 flex items-center gap-2">
                <History size={16} className="text-muted-foreground/60" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Activity Feed</h2>
              </div>
              <div className="p-6 space-y-1">
                <ActivityItem event="Listing submitted: Vintage Levi's 501" time="2 minutes ago" type="listing" />
                <ActivityItem event="Item sold: Chanel Classic Flap Bag" time="14 minutes ago" type="sale" />
                <ActivityItem event="Listing approved: Rolex Submariner" time="1 hour ago" type="approval" />
                <ActivityItem event="Withdrawal requested by @janesmith" time="3 hours ago" type="request" />
                <ActivityItem event="Item received: Hermès Silk Scarf" time="5 hours ago" type="listing" />
                <ActivityItem event="Item sold: Arc'teryx Beta AR" time="6 hours ago" type="sale" />
                <button className="w-full mt-5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border/50 rounded-lg hover:bg-secondary transition-all">
                  View full audit log
                </button>
              </div>
            </div>
          </motion.section>
        </div>
      </motion.div>
    </div>
  </div>
);

export default Index;


## 2. ActionItem.tsx

import { ArrowRight } from "lucide-react";

interface ActionItemProps {
  label: string;
  count: number;
  colorClass: string;
  subtitle?: string;
}

const ActionItem = ({ label, count, colorClass, subtitle = "Requires review" }: ActionItemProps) => (
  <button className="w-full group flex items-center justify-between p-4 rounded-lg border border-transparent hover:bg-secondary hover:border-border transition-all duration-200">
    <div className="flex items-center gap-4">
      <div className={`w-1.5 h-8 rounded-full ${colorClass}`} />
      <div className="text-left">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-sm font-bold tabular-nums text-foreground">{count}</span>
      <ArrowRight size={16} className="text-border group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
    </div>
  </button>
);

export default ActionItem;


## ActivityItem.tsx

import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

interface ActivityItemProps {
  event: string;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconMap = {
  sale: <ShoppingBag size={14} className="text-emerald-600" />,
  approval: <CheckCircle2 size={14} className="text-blue-600" />,
  request: <Clock size={14} className="text-amber-600" />,
  listing: <Package size={14} className="text-muted-foreground" />,
};

const ActivityItem = ({ event, time, type }: ActivityItemProps) => (
  <div className="flex gap-4 py-3 first:pt-0 last:pb-0 border-b last:border-0 border-border/50">
    <div className="mt-1 w-8 h-8 rounded-full bg-secondary border border-border/60 flex items-center justify-center shrink-0">
      {iconMap[type]}
    </div>
    <div className="flex flex-col">
      <p className="text-sm text-foreground leading-relaxed font-medium">{event}</p>
      <p className="text-xs text-muted-foreground/60 tabular-nums">{time}</p>
    </div>
  </div>
);

export default ActivityItem;


## StatsCard.tsx

import { ArrowUpRight, LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
}

const StatsCard = ({ label, value, trend, icon: Icon }: StatsCardProps) => (
  <div className="bg-card border border-border/60 rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-muted-foreground/30 transition-colors duration-200">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-secondary rounded-lg border border-border/60">
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Live</span>
    </div>
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </h3>
        {trend && (
          <span className="text-xs font-medium text-emerald-600 flex items-center">
            <ArrowUpRight size={12} className="mr-0.5" />
            {trend}
          </span>
        )}
      </div>
    </div>
  </div>
);

export default StatsCard;
