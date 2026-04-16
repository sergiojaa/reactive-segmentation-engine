import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SegmentDeltaSignal } from './segment-delta-signal.types';

const DEFAULT_RECENT_CAP = 50;

/**
 * In-process pub/sub for segment delta signals. Demo-friendly (SSE + recent buffer)
 * without adding a separate message broker for this phase.
 */
@Injectable()
export class SegmentDeltaSignalBridgeService {
  private readonly stream = new Subject<SegmentDeltaSignal>();

  private recent: SegmentDeltaSignal[] = [];

  publish(signal: SegmentDeltaSignal): void {
    this.recent = [signal, ...this.recent].slice(0, DEFAULT_RECENT_CAP);
    this.stream.next(signal);
  }

  observe(): Observable<SegmentDeltaSignal> {
    return this.stream.asObservable();
  }

  getRecent(limit: number): SegmentDeltaSignal[] {
    const cap = Math.min(Math.max(limit, 1), DEFAULT_RECENT_CAP);
    return this.recent.slice(0, cap);
  }
}
