"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SessionRecoveryResponse } from "@/app/api/sessions/[id]/recovery/route";

const STORAGE_KEY = "ctc_active_pm_session_id";

export interface UseSessionRecoveryReturn {
  sessionId: string | null;
  recoveryData: SessionRecoveryResponse | null;
  isLoading: boolean;
  error: string | null;
  loadSession: (targetId: string) => Promise<void>;
  startNewSession: () => void;
  refreshRecovery: () => Promise<void>;
}

export function useSessionRecovery(): UseSessionRecoveryReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<SessionRecoveryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Request counter to safely cancel/ignore stale async responses
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRecovery = useCallback(async (targetId: string) => {
    // Increment request token and abort any existing in-flight fetch
    activeRequestIdRef.current += 1;
    const currentRequestId = activeRequestIdRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${targetId}/recovery`, {
        signal: controller.signal,
      });

      // Check if another request superseded this one
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.code === "SESSION_NOT_FOUND") {
          // Stale session ID in storage/URL, clear cleanly
          if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
            const url = new URL(window.location.href);
            url.searchParams.delete("session");
            window.history.replaceState({}, "", url.pathname + url.search);
          }
          setSessionId(null);
          setRecoveryData(null);
          return;
        }
        throw new Error(json.error || "Failed to recover session");
      }

      // Validate returned session ID strictly matches targetId (Adjustment 3)
      if (json.data?.session?.id !== targetId) {
        console.warn("Mismatched session ID in recovery response; discarding stale data.");
        return;
      }

      setRecoveryData(json.data);
      setSessionId(targetId);

      // Persist to localStorage and sync URL query parameter without full navigation
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, targetId);
        const url = new URL(window.location.href);
        if (url.searchParams.get("session") !== targetId) {
          url.searchParams.set("session", targetId);
          window.history.replaceState({}, "", url.pathname + url.search);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        return; // Normal cancellation
      }
      if (currentRequestId === activeRequestIdRef.current) {
        setError(err instanceof Error ? err.message : "Error recovering session");
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Safe session switching (Adjustment 3)
  const loadSession = useCallback(
    async (targetId: string) => {
      if (!targetId) return;

      // Immediately clear current UI state to prevent Customer A data leaking to Customer B
      setRecoveryData(null);
      setError(null);
      setSessionId(targetId);

      await fetchRecovery(targetId);
    },
    [fetchRecovery]
  );

  // Start New Session (Adjustment 4)
  const startNewSession = useCallback(() => {
    // Invalidate any active requests
    activeRequestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear active workspace state and storage references without deleting DB records
    setSessionId(null);
    setRecoveryData(null);
    setError(null);
    setIsLoading(false);

    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("session");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const refreshRecovery = useCallback(async () => {
    if (sessionId) {
      await fetchRecovery(sessionId);
    }
  }, [sessionId, fetchRecovery]);

  // Initial mount: URL precedence over localStorage (Adjustment 3)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get("session");
    const storedSessionId = localStorage.getItem(STORAGE_KEY);

    const initialId = urlSessionId || storedSessionId;
    if (initialId && initialId.trim()) {
      loadSession(initialId.trim());
    }
  }, [loadSession]);

  return {
    sessionId,
    recoveryData,
    isLoading,
    error,
    loadSession,
    startNewSession,
    refreshRecovery,
  };
}
