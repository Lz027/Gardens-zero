import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Thread = Database["public"]["Tables"]["threads"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

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

export function useThreads() {
  return useQuery({
    queryKey: ["threads"],
    queryFn: () =>
      unwrap<Thread[]>(
        supabase.from("threads").select("*").order("updated_at", { ascending: false }),
      ),
  });
}

export function useMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["messages", threadId],
    enabled: Boolean(threadId),
    queryFn: () =>
      unwrap<Message[]>(
        supabase
          .from("messages")
          .select("*")
          .eq("thread_id", threadId as string)
          .order("created_at", { ascending: true }),
      ),
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { title?: string; pillar?: Database["public"]["Enums"]["pillar"] | null } = {},
    ) => {
      const user_id = await userId();
      const rows = await unwrap<Thread[]>(
        supabase
          .from("threads")
          .insert({ user_id, title: input.title ?? "New chat", pillar: input.pillar ?? null })
          .select(),
      );
      return rows[0];
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["threads"] }),
  });
}

export function useUpdateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Thread> & { id: string }) =>
      unwrap(supabase.from("threads").update(patch).eq("id", id).select()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["threads"] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("messages").delete().eq("thread_id", id);
      const { error } = await supabase.from("threads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["threads"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, text }: { threadId: string; text: string }) => {
      const user_id = await userId();
      const rows = await unwrap<Message[]>(
        supabase
          .from("messages")
          .insert({ user_id, thread_id: threadId, role: "user", text_content: text, parts: [] })
          .select(),
      );
      await supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
      return rows[0];
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ["messages", variables.threadId] });
      void qc.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; threadId: string }) => {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) =>
      void qc.invalidateQueries({ queryKey: ["messages", variables.threadId] }),
  });
}
