"use client";

import { OptionPicker, SearchBar } from "@drekis/shader";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { FilterShell } from "@/components/filter-shell";
import { DOMAINS } from "@/lib/domains";

function Domains() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const current = sp.get("domain") ?? "collections";

  const filtered = useMemo(
    () => DOMAINS.filter((d) => d.label.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );

  return (
    <FilterShell
      title="Domains"
      filters={
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Find a domain</span>
          <SearchBar value={q} onValueChange={setQ} placeholder="Search domains…" size="sm" />
        </div>
      }
    >
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Go to</h1>
      <OptionPicker
        columns={3}
        current={current}
        options={filtered.map((d) => ({
          id: d.id,
          label: d.label,
          description: d.description,
          icon: d.icon,
        }))}
        onSelect={(id) => {
          const d = DOMAINS.find((x) => x.id === id);
          if (d) router.push(d.href as Route);
        }}
      />
    </FilterShell>
  );
}

export default function DomainsRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <Domains />
    </Suspense>
  );
}
