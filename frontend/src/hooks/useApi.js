import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";

// A sequence number handles out-of-order responses; AbortController also frees the request.
export function useApi(action, params = {}, enabled = true, { revision } = {}) {
  const key = JSON.stringify(params);
  const sequence = useRef(0);
  const controller = useRef(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const servedRevision = useRef(-1);
  const observedRevision = useRef(revision);
  const pendingRevision = useRef(null);
  const [result, setResult] = useState({
    data: null,
    meta: null,
    loading: enabled,
    error: null,
  });
  const refresh = useCallback(
    async function load({
      quiet = false,
      background = false,
      onlyIfIdle = false,
    } = {}) {
      if (!enabled || !mounted.current || (onlyIfIdle && inFlight.current))
        return null;
      const request = ++sequence.current;
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      inFlight.current = true;
      let successful = false;
      if (!quiet) setResult((old) => ({ ...old, loading: true, error: null }));
      try {
        const response = await api(action, {
          params: JSON.parse(key),
          signal: active.signal,
          background,
        });
        if (sequence.current !== request) return null;
        successful = true;
        servedRevision.current = Number(response.meta?.revision ?? -1);
        setResult({ ...response, loading: false, error: null });
        return response;
      } catch (error) {
        if (error.name !== "AbortError" && sequence.current === request) {
          setResult((old) => ({ ...old, loading: false, error }));
        }
        return null;
      } finally {
        if (sequence.current === request) {
          inFlight.current = false;
          const required = pendingRevision.current;
          pendingRevision.current = null;
          // A newer bootstrap may arrive while a genuine user request is running.
          // Finish that request first, then revalidate once if its snapshot is older.
          if (
            successful &&
            required != null &&
            servedRevision.current < required
          ) {
            queueMicrotask(() => {
              if (mounted.current && sequence.current === request) {
                load({ background: true });
              }
            });
          }
        }
      }
    },
    [action, key, enabled],
  );
  useEffect(() => {
    mounted.current = true;
    servedRevision.current = -1;
    pendingRevision.current = null;
    setResult({ data: null, meta: null, loading: enabled, error: null });
    refresh();
    return () => {
      mounted.current = false;
      ++sequence.current;
      controller.current?.abort();
      inFlight.current = false;
    };
  }, [refresh, enabled]);
  useEffect(() => {
    const changed = observedRevision.current !== revision;
    observedRevision.current = revision;
    if (
      !changed ||
      !enabled ||
      revision == null ||
      servedRevision.current >= revision
    )
      return;
    if (inFlight.current) pendingRevision.current = revision;
    else refresh({ background: true });
  }, [revision, enabled, refresh]);
  return { ...result, refresh };
}
