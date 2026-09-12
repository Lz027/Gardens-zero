import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const APPLICATION_STATUSES = [
  "planning",
  "preparing",
  "submitted",
  "interview",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type Opportunity = Database["public"]["Tables"]["opportunities"]["Row"];
export type SavedOpportunity = Database["public"]["Tables"]["saved_opportunities"]["Row"];
export type Application = Database["public"]["Tables"]["applications"]["Row"] & {
  opportunity?: Opportunity;
};

type DbResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
async function unwrap<T>(request: DbResult<T>) {
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as T;
}

export function useOpportunities() {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: () =>
      unwrap<Opportunity[]>(
        supabase
          .from("opportunities")
          .select("*")
          .eq("is_active", true)
          .order("deadline", { ascending: true, nullsFirst: false }),
      ),
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    enabled: Boolean(id),
    queryFn: () =>
      unwrap<Opportunity[]>(supabase.from("opportunities").select("*").eq("id", id).limit(1)).then(
        (rows) => rows[0] ?? null,
      ),
  });
}

export function useSavedOpportunities() {
  return useQuery({
    queryKey: ["saved-opportunities"],
    queryFn: () => unwrap<SavedOpportunity[]>(supabase.from("saved_opportunities").select("*")),
  });
}

export function useApplications() {
  return useQuery({
    queryKey: ["applications"],
    queryFn: () =>
      unwrap<Application[]>(
        supabase
          .from("applications")
          .select("*, opportunity:opportunities(*)")
          .order("updated_at", { ascending: false }) as unknown as DbResult<Application[]>,
      ),
  });
}

export function useDashboard() {
  const applications = useApplications();
  const saved = useSavedOpportunities();
  const opportunities = useOpportunities();
  const byStatus = APPLICATION_STATUSES.reduce<Record<ApplicationStatus, number>>(
    (result, status) => {
      result[status] = (applications.data ?? []).filter((row) => row.status === status).length;
      return result;
    },
    {} as Record<ApplicationStatus, number>,
  );
  return {
    applications,
    saved,
    opportunities,
    totals: {
      activeOpportunities: opportunities.data?.length ?? 0,
      saved: saved.data?.length ?? 0,
      applications: applications.data?.length ?? 0,
    },
    byStatus,
  };
}

export function useSaveOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Please sign in to save an opportunity");
      const result = await supabase
        .from("saved_opportunities")
        .insert({ user_id: data.user.id, opportunity_id: opportunityId })
        .select()
        .single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-opportunities"] }),
  });
}

export function useUnsaveOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const result = await supabase
        .from("saved_opportunities")
        .delete()
        .eq("opportunity_id", opportunityId);
      if (result.error) throw result.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-opportunities"] }),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Please sign in to track an application");
      const result = await supabase
        .from("applications")
        .insert({ user_id: data.user.id, opportunity_id: opportunityId })
        .select()
        .single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          Database["public"]["Tables"]["applications"]["Update"],
          "status" | "notes" | "next_action" | "next_action_due_at" | "submitted_at"
        >
      >;
    }) => {
      const result = await supabase
        .from("applications")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await supabase.from("applications").delete().eq("id", id);
      if (result.error) throw result.error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}
