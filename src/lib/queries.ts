import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PillarEntry = Database["public"]["Tables"]["pillar_entries"]["Row"];
export type AppLink = Database["public"]["Tables"]["apps"]["Row"];
export type Recent = Database["public"]["Tables"]["recents"]["Row"];
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type Settings = Database["public"]["Tables"]["settings"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await promise;
  if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
  return data as T;
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => unwrap<Profile[]>(supabase.from("profiles").select("*").limit(1)),
    select: (rows) => rows[0] ?? null,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => unwrap<Settings[]>(supabase.from("settings").select("*").limit(1)),
    select: (rows) => rows[0] ?? null,
  });
}

export function usePillarEntries(pillar?: Database["public"]["Enums"]["pillar"]) {
  return useQuery({
    queryKey: ["pillar_entries", pillar ?? "all"],
    queryFn: () => {
      let query = supabase
        .from("pillar_entries")
        .select("*")
        .order("created_at", { ascending: false });
      if (pillar) query = query.eq("pillar", pillar);
      return unwrap<PillarEntry[]>(query);
    },
  });
}

export function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: () =>
      unwrap<AppLink[]>(supabase.from("apps").select("*").order("position", { ascending: true })),
  });
}

export function useRecents() {
  return useQuery({
    queryKey: ["recents"],
    queryFn: () =>
      unwrap<Recent[]>(
        supabase.from("recents").select("*").order("visited_at", { ascending: false }).limit(8),
      ),
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: () =>
      unwrap<EventRow[]>(
        supabase.from("events").select("*").order("starts_at", { ascending: true }).limit(50),
      ),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      unwrap<Notification[]>(
        supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: string[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function useMutate<TInput>(fn: (input: TInput) => Promise<unknown>, invalidate: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
