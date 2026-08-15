/**
 * Real-time push over SSE (see `apps/backend/src/server.ts`'s `/api/events`
 * routes and `apps/frontend/src/hooks/useLiveStream.ts`). Deliberately just a
 * "something in this collection changed" signal, not a typed payload per
 * mutation — every consumer today reacts by refetching the relevant list
 * (the same `api.listX()` call each page already makes on mount), so there's
 * nothing a payload would save; carrying one would just be data no one reads.
 */
export type StoreEventKind =
  | 'attestation'
  | 'payment'
  | 'evidence-submission'
  | 'risk-analysis'
  | 'signature-verification'
  | 'destination-wallet'
  | 'fraud-alert'
  | 'settlement-job';

export interface StoreEvent {
  kind: StoreEventKind;
}
