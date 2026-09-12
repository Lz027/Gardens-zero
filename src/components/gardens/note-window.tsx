import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Minimize2, X } from "lucide-react";
import { useDeleteNote, useUpdateNote, type Note } from "@/lib/desk-queries";
import { usePillars } from "@/lib/pillar-queries";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Geometry = { pos_x: number; pos_y: number; width: number; height: number };

export function NoteWindow({
  note,
  onFocus,
  bounds,
}: {
  note: Note;
  onFocus: () => void;
  bounds: React.RefObject<HTMLDivElement | null>;
}) {
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const { data: pillars } = usePillars();

  const [geo, setGeo] = useState<Geometry>({
    pos_x: note.pos_x,
    pos_y: note.pos_y,
    width: note.width,
    height: note.height,
  });
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  const geoRef = useRef(geo);
  geoRef.current = geo;
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; geo: Geometry } | null>(
    null,
  );

  useEffect(() => {
    if (drag.current) return;
    setGeo({ pos_x: note.pos_x, pos_y: note.pos_y, width: note.width, height: note.height });
  }, [note.pos_x, note.pos_y, note.width, note.height]);

  // autosave text
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    const t = setTimeout(() => update.mutate({ id: note.id, title, body }), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // pointer handlers are bound once — no listener churn while dragging
  useEffect(() => {
    let frame = 0;
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const limit = bounds.current?.getBoundingClientRect();
      const maxX = (limit?.width ?? 2000) - 80;
      const maxY = (limit?.height ?? 2000) - 40;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (d.mode === "move") {
          setGeo({
            ...d.geo,
            pos_x: Math.max(0, Math.min(maxX, d.geo.pos_x + dx)),
            pos_y: Math.max(0, Math.min(maxY, d.geo.pos_y + dy)),
          });
        } else {
          setGeo({
            ...d.geo,
            width: Math.max(260, Math.min((limit?.width ?? 2000) - d.geo.pos_x, d.geo.width + dx)),
            height: Math.max(
              180,
              Math.min((limit?.height ?? 2000) - d.geo.pos_y, d.geo.height + dy),
            ),
          });
        }
      });
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      setDragging(false);
      update.mutate({ id: note.id, ...geoRef.current });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  function start(mode: "move" | "resize", e: React.PointerEvent) {
    if (note.is_maximized && mode === "move") return;
    e.preventDefault();
    onFocus();
    setDragging(true);
    drag.current = { mode, x: e.clientX, y: e.clientY, geo: geoRef.current };
  }

  if (note.is_minimized) return null;

  const maximized = note.is_maximized;

  return (
    <div
      className={cn(
        "panel absolute flex flex-col overflow-hidden rounded-xl shadow-xl",
        !dragging && "transition-[left,top,width,height] duration-150",
        dragging && "select-none",
      )}
      style={
        maximized
          ? { left: 0, top: 0, width: "100%", height: "100%", zIndex: note.z_index }
          : {
              left: geo.pos_x,
              top: geo.pos_y,
              width: geo.width,
              height: geo.height,
              zIndex: note.z_index,
            }
      }
      onPointerDown={onFocus}
    >
      <div
        onPointerDown={(e) => start("move", e)}
        onDoubleClick={() => update.mutate({ id: note.id, is_maximized: !maximized })}
        className={cn(
          "flex items-center gap-2 border-b border-border bg-card/80 px-2.5 py-1.5",
          maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <span className="size-2 rounded-full bg-iris" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
          aria-label="Note title"
        />
        <button
          type="button"
          aria-label="Minimise note"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update.mutate({ id: note.id, is_minimized: true })}
          className="text-muted-foreground hover:text-foreground"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore note" : "Maximise note"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update.mutate({ id: note.id, is_maximized: !maximized })}
          className="text-muted-foreground hover:text-foreground"
        >
          {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Delete note"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => remove.mutate(note.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Start typing…"
        className="flex-1 resize-none bg-transparent p-3 text-sm leading-relaxed outline-none"
      />
      <div className="flex items-center gap-2 border-t border-border px-2.5 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Pillar</span>
        <select
          value={note.pillar ?? ""}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            update.mutate({
              id: note.id,
              pillar: (e.target.value === "" ? null : e.target.value) as
                Database["public"]["Enums"]["pillar"] | null,
            })
          }
          className="h-6 rounded border border-input bg-card px-1 text-[11px] text-foreground"
          aria-label="File note under a pillar"
        >
          <option value="">Unfiled</option>
          {(pillars ?? []).map((p) => (
            <option key={p.id} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {!maximized && (
        <div
          onPointerDown={(e) => start("resize", e)}
          className={cn(
            "absolute bottom-0 right-0 size-4 cursor-se-resize",
            "bg-[linear-gradient(135deg,transparent_50%,var(--color-border)_50%)]",
          )}
        />
      )}
    </div>
  );
}
