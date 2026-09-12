import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Info, MessageSquare, Settings2, StickyNote, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { usePillarEntries, useInvalidate, currentUserId } from "@/lib/queries";
import { useCreateNote, useNotes, useUpdateNote } from "@/lib/desk-queries";
import { useCreateThread, useThreads, useUpdateThread } from "@/lib/chat-queries";
import { usePillars, useUpdatePillar, useDeletePillar, type PillarRow } from "@/lib/pillar-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillarIconPicker } from "@/components/gardens/pillar-icon-picker";
import {
  accentText,
  iconFor,
  ENTRY_KINDS,
  ENTRY_KIND_LABEL,
  STARTER_SLUGS,
  type EntryKind,
} from "@/lib/pillars";

export const Route = createFileRoute("/_authenticated/pillars/$pillar")({
  head: () => ({
    meta: [
      { title: "Folder — Gardens Zero" },
      {
        name: "description",
        content: "Notes, chats and progress filed under one Gardens Zero folder.",
      },
      { property: "og:title", content: "Folder — Gardens Zero" },
      {
        property: "og:description",
        content: "Notes, chats and progress filed under one Gardens Zero folder.",
      },
    ],
  }),
  component: PillarPage,
});

function PillarPage() {
  const { pillar } = Route.useParams();
  const { data: pillars, isLoading } = usePillars();
  const row = (pillars ?? []).find((p) => p.slug === pillar) ?? null;

  if (isLoading) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">Opening folder…</p>;
  }
  if (!row) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">This folder no longer exists</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been renamed or removed. Pick another folder from the bar below.
        </p>
      </div>
    );
  }
  return <PillarBody key={row.id} row={row} />;
}

function PillarBody({ row }: { row: PillarRow }) {
  const Icon = iconFor(row.icon);
  const navigate = useNavigate();
  const pillarSlug = row.slug as Database["public"]["Enums"]["pillar"];
  const { data: entries } = usePillarEntries(pillarSlug);
  const { data: notes } = useNotes();
  const { data: threads } = useThreads();
  const createThread = useCreateThread();
  const updateThread = useUpdateThread();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const updatePillar = useUpdatePillar();
  const deletePillar = useDeletePillar();
  const invalidate = useInvalidate();
  const [kind, setKind] = useState<EntryKind>("done");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);

  const filed = (notes ?? []).filter((n) => n.pillar === row.slug);
  const chats = (threads ?? []).filter((t) => t.pillar === row.slug);
  const premade = STARTER_SLUGS.includes(row.slug);

  async function addEntry() {
    const text = content.trim();
    if (!text) return;
    const userId = await currentUserId();
    if (!userId) return;
    await supabase.from("pillar_entries").insert({
      user_id: userId,
      pillar: row.slug as Database["public"]["Enums"]["pillar"],
      kind,
      content: text,
    });
    setContent("");
    invalidate(["pillar_entries"]);
  }

  async function newNoteHere() {
    await createNote.mutateAsync({
      pillar: row.slug as Database["public"]["Enums"]["pillar"],
      title: `${row.label} note`,
    });
    navigate({ to: "/home" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card">
          <Icon className={`size-5 ${accentText(row.accent)}`} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{row.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{row.blurb}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Customise this folder"
          onClick={() => setEditing((v) => !v)}
        >
          <Settings2 className="size-4" />
        </Button>
      </div>

      {premade && !editing && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          This folder came ready-made. Rename it, give it another icon, or delete it — and add your
          own folders from the bar at the bottom.
        </p>
      )}

      {editing && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() =>
              label.trim() && label !== row.label
                ? updatePillar.mutate({ id: row.id, label: label.trim() })
                : undefined
            }
            aria-label="Folder name"
            placeholder="Folder name"
          />
          <PillarIconPicker
            icon={row.icon}
            accent={row.accent}
            onIcon={(icon) => updatePillar.mutate({ id: row.id, icon })}
            onAccent={(accent) => updatePillar.mutate({ id: row.id, accent })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              await deletePillar.mutateAsync(row);
              navigate({ to: "/home" });
            }}
          >
            <Trash2 className="size-4" /> Delete this folder
          </Button>
        </div>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Notes in this folder ({filed.length})
          </h2>
          <Button size="sm" variant="outline" onClick={() => void newNoteHere()}>
            <StickyNote className="size-4" /> New note here
          </Button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {filed.map((note) => (
            <li key={note.id} className="panel rounded-lg p-3">
              <div className="truncate text-sm font-medium">{note.title}</div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {note.body || "Empty note"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    updateNote.mutate({ id: note.id, is_open: true, is_minimized: false });
                    navigate({ to: "/home" });
                  }}
                >
                  Open on desk
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updateNote.mutate({ id: note.id, pillar: null })}
                >
                  Unfile
                </Button>
              </div>
            </li>
          ))}
          {filed.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No notes filed here yet. Label a note with {row.label} and it lands in this folder.
            </li>
          )}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Chats in this folder ({chats.length})
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await createThread.mutateAsync({ pillar: pillarSlug, title: `${row.label} chat` });
              navigate({ to: "/home" });
            }}
          >
            <MessageSquare className="size-4" /> New chat here
          </Button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {chats.map((thread) => (
            <li key={thread.id} className="panel flex items-center gap-2 rounded-lg p-3">
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateThread.mutate({ id: thread.id, pillar: null })}
              >
                Unfile
              </Button>
            </li>
          ))}
          {chats.length === 0 && (
            <li className="text-sm text-muted-foreground">No chats filed here yet.</li>
          )}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">Progress</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EntryKind)}
            aria-label="Kind of progress"
            className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
          >
            {ENTRY_KINDS.map((option) => (
              <option key={option} value={option}>
                {ENTRY_KIND_LABEL[option]}
              </option>
            ))}
          </select>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Log progress…"
            className="h-9 min-w-0 flex-1"
          />
          <Button onClick={() => void addEntry()}>Add</Button>
        </div>

        <div className="mt-6 space-y-6">
          {ENTRY_KINDS.map((section) => {
            const items = (entries ?? []).filter((entry) => entry.kind === section);
            if (items.length === 0) return null;
            return (
              <div key={section}>
                <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {ENTRY_KIND_LABEL[section]}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {items.map((entry) => (
                    <li key={entry.id} className="panel rounded-lg p-3 text-sm">
                      {entry.content}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
