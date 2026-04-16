export type SegmentDeltaSignal = {
  segmentId: string;
  evaluationRunId: string | null;
  addedCustomerIds: string[];
  removedCustomerIds: string[];
  addedCount: number;
  removedCount: number;
  timestamp: string;
};
