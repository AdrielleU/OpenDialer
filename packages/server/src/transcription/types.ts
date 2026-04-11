/**
 * Batch (post-call) speech-to-text provider interface.
 *
 * The orchestrator reads/downloads the recording into a Blob (because the
 * source might be a local file OR a remote URL) and hands the Blob to the
 * provider. Providers are pure — they only know about the audio bytes, not
 * about where they came from. This makes them trivial to test.
 */
export interface BatchSTTProvider {
  /** Human-readable name (used in logs and the SSE event payload). */
  name: string;

  /**
   * Transcribe the given audio blob. Throwing is fine — the orchestrator
   * catches and logs everything.
   */
  transcribe(audio: Blob): Promise<TranscriptResult>;
}

export interface TranscriptResult {
  text: string;
  /** 0..1 confidence if the provider returns one, otherwise null. */
  confidence: number | null;
}
