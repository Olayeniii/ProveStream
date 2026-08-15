import type { StoreEventKind } from '@provenance-streams/protocol';
import { useEffect, useRef } from 'react';

const REFETCH_DEBOUNCE_MS = 250;

/**
 * Subscribes to the backend's `/api/events` SSE stream and calls `refetch`
 * whenever one of `kinds` changes — replaces per-page polling (and the old
 * fetch-once-on-mount-and-never-again pattern most pages had) with real
 * push. `refetch` is expected to be the same `api.listX().then(setX)` call
 * each page already makes on mount; this hook only decides *when* to call
 * it, not how.
 *
 * One Store mutation can emit several related kinds in quick succession
 * (e.g. a new attestation also creates a pending signature-verification and
 * risk-analysis) — debounced into one `refetch` rather than one per event.
 * `EventSource` has no gap-fill/replay, so a reconnect after a dropped
 * connection also triggers a catch-up `refetch`, skipped on the very first
 * connect since the page's own mount-time fetch already covers that.
 */
export function useLiveStream(
  url: string | undefined,
  kinds: readonly StoreEventKind[],
  refetch: () => void,
): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  useEffect(() => {
    if (!url) {
      return;
    }

    let hasOpenedOnce = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(url);

    const scheduleRefetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refetchRef.current(), REFETCH_DEBOUNCE_MS);
    };

    source.addEventListener('change', (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as { kind: StoreEventKind };
      if (kindsRef.current.includes(data.kind)) {
        scheduleRefetch();
      }
    });

    source.addEventListener('open', () => {
      if (hasOpenedOnce) {
        scheduleRefetch();
      }
      hasOpenedOnce = true;
    });

    return () => {
      clearTimeout(debounceTimer);
      source.close();
    };
  }, [url]);
}
