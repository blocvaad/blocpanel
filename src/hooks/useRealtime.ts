"use client";
import { useEffect, useRef } from "react";

interface RealtimeEvent {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

export function useRealtime(
  table: string,
  onEvent: (event: RealtimeEvent) => void,
  filter?: string
) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    let supabase: any;

    async function setup() {
      const { createClient } = await import("@supabase/supabase-js");
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const channel = supabase
        .channel(`realtime:${table}:${filter ?? "all"}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        }, (payload: any) => {
          onEvent({
            type: payload.eventType,
            table,
            record: payload.new ?? {},
            old_record: payload.old,
          });
        })
        .subscribe();

      channelRef.current = channel;
    }

    setup();

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [table, filter]);
}
