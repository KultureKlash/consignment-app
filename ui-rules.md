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

## index.css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 220 25% 10%;
    --foreground: 210 20% 92%;

    --card: 215 25% 14%;
    --card-foreground: 210 20% 92%;

    --popover: 215 25% 14%;
    --popover-foreground: 210 20% 92%;

    --primary: 185 72% 55%;
    --primary-foreground: 220 25% 8%;

    --secondary: 215 20% 20%;
    --secondary-foreground: 210 20% 85%;

    --muted: 215 18% 18%;
    --muted-foreground: 215 15% 55%;

    --accent: 185 72% 55%;
    --accent-foreground: 220 25% 8%;

    --destructive: 0 62% 55%;
    --destructive-foreground: 210 20% 98%;

    --border: 215 20% 22%;
    --input: 215 20% 18%;
    --ring: 185 72% 55%;

    --radius: 0.75rem;

    --glass: 215 25% 14%;
    --glass-border: 215 20% 28%;
    --glow: 185 72% 55%;
    --success: 152 60% 52%;
    --warning: 38 92% 60%;

    --sidebar-background: 220 25% 10%;
    --sidebar-foreground: 210 20% 75%;
    --sidebar-primary: 185 72% 55%;
    --sidebar-primary-foreground: 220 25% 8%;
    --sidebar-accent: 215 20% 18%;
    --sidebar-accent-foreground: 210 20% 92%;
    --sidebar-border: 215 20% 22%;
    --sidebar-ring: 185 72% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-family: 'Inter', sans-serif;
  }
}

@layer components {
  .glass-panel {
    @apply bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] shadow-xl;
  }
  .glass-panel-strong {
    @apply bg-white/[0.1] backdrop-blur-2xl border border-white/[0.15] shadow-2xl;
  }
  .glass-input {
    @apply bg-white/[0.06] backdrop-blur-md border border-white/[0.1] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200;
  }
  .glow-border {
    @apply border border-primary/30 shadow-[0_0_15px_-3px_hsl(var(--glow)/0.3)];
  }
  .glow-text {
    text-shadow: 0 0 20px hsl(var(--glow) / 0.4);
  }
  .stat-card {
    @apply glass-panel rounded-2xl p-6 transition-all duration-300 hover:bg-white/[0.09] hover:shadow-[0_0_30px_-5px_hsl(var(--glow)/0.15)] hover:-translate-y-0.5;
  }
  .nav-item {
    @apply flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-white/[0.06];
  }
  .nav-item-active {
    @apply text-primary bg-primary/[0.1] shadow-[inset_0_0_20px_-8px_hsl(var(--glow)/0.2)];
  }
  .table-row-glass {
    @apply transition-all duration-200 hover:bg-white/[0.04] cursor-pointer;
  }
  .btn-glow {
    @apply bg-gradient-to-r from-primary/90 to-primary text-primary-foreground font-semibold rounded-xl px-6 py-2.5 transition-all duration-200 hover:shadow-[0_0_25px_-3px_hsl(var(--glow)/0.5)] hover:-translate-y-0.5 active:scale-[0.97];
  }
}

@layer utilities {
  .animate-glow-pulse {
    animation: glow-pulse 3s ease-in-out infinite;
  }
  .animate-slide-up {
    animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .animate-fade-in {
    animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 15px -3px hsl(var(--glow) / 0.2); }
  50% { box-shadow: 0 0 25px -3px hsl(var(--glow) / 0.35); }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.98); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes fade-in {
  from { opacity: 0; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}


## Login.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import bgWorkspace from "@/assets/bg-workspace.jpg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      {/* BG */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgWorkspace})` }}
      />
      <div className="fixed inset-0 bg-background/80 backdrop-blur-md" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="glass-panel-strong rounded-3xl p-8 glow-border animate-slide-up">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center glow-border mb-4">
              <Package className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">ConsignorHQ</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
              />
            </div>
            <div className="text-right">
              <button type="button" className="text-xs text-primary hover:underline">
                Forgot password?
              </button>
            </div>
            <button type="submit" className="btn-glow w-full py-3 text-center">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}



## dashboard.tsx
import { AppHeader } from "@/components/AppHeader";
import { DollarSign, Package, ShoppingBag, Clock } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const stats = [
  { label: "Total Earnings", value: "$12,847", icon: DollarSign, change: "+12.3%" },
  { label: "Active Listings", value: "34", icon: Package, change: "+3" },
  { label: "Items Sold", value: "128", icon: ShoppingBag, change: "+8 this mo." },
  { label: "Pending Payouts", value: "$2,340", icon: Clock, change: "3 pending" },
];

const earningsData = [
  { month: "Jul", value: 1200 },
  { month: "Aug", value: 1800 },
  { month: "Sep", value: 1400 },
  { month: "Oct", value: 2200 },
  { month: "Nov", value: 2800 },
  { month: "Dec", value: 3100 },
  { month: "Jan", value: 2600 },
  { month: "Feb", value: 3400 },
  { month: "Mar", value: 3847 },
];

const listingsStatus = [
  { label: "Active", value: 34, max: 50, color: "bg-primary" },
  { label: "Pending Approval", value: 8, max: 50, color: "bg-warning" },
  { label: "Sold", value: 128, max: 200, color: "bg-success" },
];

const salesBreakdown = [
  { name: "Sneakers", value: 45 },
  { name: "Apparel", value: 28 },
  { name: "Accessories", value: 17 },
  { name: "Other", value: 10 },
];

const pieColors = [
  "hsl(185, 72%, 55%)",
  "hsl(152, 60%, 52%)",
  "hsl(38, 92%, 60%)",
  "hsl(280, 50%, 60%)",
];

export default function Dashboard() {
  return (
    <div>
      <AppHeader title="Welcome back," subtitle="Marcus Reid" />

      <div className="px-6 md:px-8 pb-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="stat-card animate-slide-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight">{stat.value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-primary mt-3">{stat.change}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Earnings chart */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "320ms" }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Performance</h2>
                <p className="text-sm text-muted-foreground">Earnings over time</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary glow-text">$3,847</p>
                <p className="text-xs text-muted-foreground">This month</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={earningsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 20%)" />
                <XAxis dataKey="month" stroke="hsl(215, 15%, 45%)" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(215, 15%, 45%)" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(215, 25%, 14%)",
                    border: "1px solid hsl(215, 20%, 28%)",
                    borderRadius: "12px",
                    color: "hsl(210, 20%, 92%)",
                    boxShadow: "0 0 20px hsl(185, 72%, 55%, 0.15)",
                  }}
                  formatter={(value: number) => [`$${value}`, "Earnings"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(185, 72%, 55%)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "hsl(185, 72%, 55%)", stroke: "hsl(220, 25%, 10%)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Listings status */}
            <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "400ms" }}>
              <h3 className="text-base font-semibold mb-4">Listings Status</h3>
              <div className="space-y-4">
                {listingsStatus.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: `${(item.value / item.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales breakdown */}
            <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "480ms" }}>
              <h3 className="text-base font-semibold mb-4">Sales Breakdown</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie
                      data={salesBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={45}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {salesBreakdown.map((_, i) => (
                        <Cell key={i} fill={pieColors[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {salesBreakdown.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: pieColors[i] }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


## Listings.tsx

import { AppHeader } from "@/components/AppHeader";
import { Search } from "lucide-react";
import { useState } from "react";

const listings = [
  { id: 1, product: "Air Jordan 1 Retro High OG", size: "10", price: 285, status: "Active", date: "Mar 12, 2026" },
  { id: 2, product: "Yeezy Boost 350 V2 Slate", size: "9.5", price: 340, status: "Active", date: "Mar 10, 2026" },
  { id: 3, product: "New Balance 550 Sea Salt", size: "11", price: 165, status: "Pending", date: "Mar 8, 2026" },
  { id: 4, product: "Nike Dunk Low Panda", size: "10.5", price: 130, status: "Sold", date: "Mar 5, 2026" },
  { id: 5, product: "Supreme Box Logo Hoodie", size: "L", price: 520, status: "Active", date: "Mar 3, 2026" },
  { id: 6, product: "Off-White Industrial Belt", size: "OS", price: 195, status: "Sold", date: "Feb 28, 2026" },
  { id: 7, product: "Travis Scott x Nike SB Dunk", size: "9", price: 1450, status: "Active", date: "Feb 25, 2026" },
  { id: 8, product: "Essentials Hoodie Oatmeal", size: "M", price: 85, status: "Pending", date: "Feb 22, 2026" },
];

const statusStyles: Record<string, string> = {
  Active: "bg-primary/15 text-primary",
  Pending: "bg-warning/15 text-warning",
  Sold: "bg-success/15 text-success",
};

export default function Listings() {
  const [search, setSearch] = useState("");
  const filtered = listings.filter((l) =>
    l.product.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <AppHeader title="Listings" subtitle="Manage your consigned items" />

      <div className="px-6 md:px-8 pb-8">
        <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up">
          {/* Search */}
          <div className="p-4 border-b border-white/[0.08]">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search listings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Listed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr
                    key={item.id}
                    className="table-row-glass border-b border-white/[0.04] animate-fade-in"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <td className="px-6 py-4 font-medium">{item.product}</td>
                    <td className="px-6 py-4 text-muted-foreground">{item.size}</td>
                    <td className="px-6 py-4 font-medium tabular-nums">${item.price}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground tabular-nums">{item.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

## Payout.tsx

import { AppHeader } from "@/components/AppHeader";
import { DollarSign } from "lucide-react";

const payouts = [
  { id: 1, date: "Mar 15, 2026", amount: 1240, status: "Paid" },
  { id: 2, date: "Mar 8, 2026", amount: 680, status: "Paid" },
  { id: 3, date: "Mar 1, 2026", amount: 920, status: "Pending" },
  { id: 4, date: "Feb 22, 2026", amount: 1450, status: "Paid" },
  { id: 5, date: "Feb 15, 2026", amount: 540, status: "Paid" },
  { id: 6, date: "Feb 8, 2026", amount: 780, status: "Pending" },
];

const statusStyles: Record<string, string> = {
  Paid: "bg-success/15 text-success",
  Pending: "bg-warning/15 text-warning",
};

export default function Payouts() {
  const available = 2340;
  const pending = 1700;
  const totalPaid = 4890;

  return (
    <div>
      <AppHeader title="Payouts" subtitle="Track your earnings and payments" />

      <div className="px-6 md:px-8 pb-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Available Balance", value: `$${available.toLocaleString()}`, accent: true },
            { label: "Pending Payouts", value: `$${pending.toLocaleString()}` },
            { label: "Total Paid", value: `$${totalPaid.toLocaleString()}` },
          ].map((card, i) => (
            <div
              key={card.label}
              className={`stat-card animate-slide-up ${card.accent ? "glow-border" : ""}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${card.accent ? "text-primary glow-text" : ""}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Request payout */}
        <div className="animate-slide-up" style={{ animationDelay: "240ms" }}>
          <button className="btn-glow flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Request Payout
          </button>
        </div>

        {/* History table */}
        <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "320ms" }}>
          <div className="px-6 py-4 border-b border-white/[0.08]">
            <h3 className="font-semibold">Payout History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p, i) => (
                  <tr
                    key={p.id}
                    className="table-row-glass border-b border-white/[0.04] animate-fade-in"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <td className="px-6 py-4 tabular-nums">{p.date}</td>
                    <td className="px-6 py-4 font-medium tabular-nums">${p.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


## Settings.tsx

import { AppHeader } from "@/components/AppHeader";
import { useState } from "react";

export default function SettingsPage() {
  const [name, setName] = useState("Marcus Reid");
  const [email, setEmail] = useState("marcus@example.com");

  return (
    <div>
      <AppHeader title="Settings" subtitle="Manage your profile" />

      <div className="px-6 md:px-8 pb-8">
        <div className="glass-panel rounded-2xl p-6 max-w-lg animate-slide-up">
          <h3 className="text-lg font-semibold mb-6">Profile Information</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Payout Method</label>
              <div className="w-full px-4 py-2.5 rounded-xl glass-input text-sm text-muted-foreground">
                Coming soon
              </div>
            </div>
            <button className="btn-glow mt-2">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}



