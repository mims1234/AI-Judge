"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { StaffMember } from "@/lib/staff";

export function StaffPanel({
  initial,
  canManage,
}: {
  initial: StaffMember[];
  canManage: boolean;
}) {
  const [staff, setStaff] = useState(initial);
  const [discordId, setDiscordId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/admin/staff", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { staff?: StaffMember[] };
    setStaff(json.staff ?? []);
  };

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discord_id: discordId.trim(),
          username: label.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not add moderator.");
        return;
      }
      setDiscordId("");
      setLabel("");
      await refresh();
    } catch {
      setError("Could not add moderator.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/staff?discord_id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not remove moderator.");
        return;
      }
      await refresh();
    } catch {
      setError("Could not remove moderator.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-md border border-line-subtle bg-ink-900 p-4">
      <h2 className="font-display text-lg uppercase tracking-[0.08em] text-bright">
        Staff
      </h2>
      <p className="mt-1 text-sm text-dim">
        Moderators can open this dashboard. Only the site admin can add or remove
        them.
      </p>

      <ul className="mt-4 flex flex-col gap-2" role="list">
        {staff.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-ink-950 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-bright">{row.username}</div>
              <div className="font-mono text-xs text-dim">{row.discord_id}</div>
            </div>
            <Badge tone={row.role === "admin" ? "teal" : "neutral"}>
              {row.locked ? "Admin · locked" : row.role}
            </Badge>
            {canManage && row.role === "moderator" && !row.locked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onRemove(row.discord_id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
        {staff.length === 0 && (
          <li className="py-6 text-center text-sm text-dim">No staff yet.</li>
        )}
      </ul>

      {canManage && (
        <form
          onSubmit={(e) => void onAdd(e)}
          className="mt-4 grid gap-3 border-t border-line-subtle pt-4 sm:grid-cols-[1fr_10rem_auto]"
        >
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-dim">
              Discord user ID
            </span>
            <Input
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="123456789012345678"
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-dim">
              Label
            </span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" variant="secondary" loading={busy}>
              Add moderator
            </Button>
          </div>
          <p className="sm:col-span-3 text-xs text-dim">
            Developer Mode in Discord → right-click their profile → Copy User ID.
            They get the Admin nav the next time they load a page.
          </p>
          {error && (
            <p role="alert" className="sm:col-span-3 text-sm text-fail-400">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
