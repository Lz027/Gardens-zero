import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { STARTER_PILLARS, slugify } from "@/lib/pillars";

export type PillarRow = Database["public"]["Tables"]["pillars"]["Row"];

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await promise;
  if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
  return data as T;
}

async function userId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

/** Every pillar folder this person owns, seeded with the starters on first run. */
export function usePillars() {
  return useQuery({
    queryKey: ["pillars"],
    queryFn: async () => {
      const rows = await unwrap<PillarRow[]>(
        supabase.from("pillars").select("*").order("sort_order", { ascending: true }),
      );
      if (rows.length > 0) return rows;
      const user_id = await userId();
      await supabase.from("pillars").upsert(
        STARTER_PILLARS.map((p, i) => ({ user_id, ...p, sort_order: i })),
        { onConflict: "user_id,slug" },
      );
      return unwrap<PillarRow[]>(
        supabase.from("pillars").select("*").order("sort_order", { ascending: true }),
      );
    },
  });
}

export function useCreatePillar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; icon?: string; accent?: string }) => {
      const user_id = await userId();
      const rows = await unwrap<PillarRow[]>(
        supabase
          .from("pillars")
          .insert({
            user_id,
            label: input.label,
            slug: slugify(input.label),
            icon: input.icon ?? "Sparkles",
            accent: input.accent ?? "iris",
            sort_order: Date.now() % 100000,
          })
          .select(),
      );
      return rows[0];
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pillars"] }),
  });
}

export function useUpdatePillar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<PillarRow> & { id: string }) =>
      unwrap(supabase.from("pillars").update(patch).eq("id", id).select()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pillars"] }),
  });
}

/** Removes the folder and unfiles anything that lived in it. */
export function useDeletePillar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pillar: PillarRow) => {
      const pillarSlug = pillar.slug as Database["public"]["Enums"]["pillar"];
      await supabase.from("notes").update({ pillar: null }).eq("pillar", pillarSlug);
      await supabase.from("threads").update({ pillar: null }).eq("pillar", pillarSlug);
      const { error } = await supabase.from("pillars").delete().eq("id", pillar.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pillars"] });
      void qc.invalidateQueries({ queryKey: ["notes"] });
      void qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}
