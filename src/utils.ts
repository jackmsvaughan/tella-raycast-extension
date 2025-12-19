// Constants
export const CACHE_FRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const GRID_INITIAL_LOAD = 24; // 6 rows × 4 columns
export const FETCH_CONCURRENCY = 5; // Concurrent API requests

// Date formatting utilities

/**
 * Formats a date string to a relative time string (e.g., "Today", "2 days ago", "Jan 15")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Formats a number with K/M suffixes for readability
 */
export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Formats total duration in seconds to a human-readable string (e.g., "2h 30m", "45m", "30s")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

// Transcript formatting utilities

/**
 * Formats seconds to [MM:SS] timestamp format
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `[${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;
}

/**
 * Formats seconds to SRT time format (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

/**
 * Formats transcript with timestamps like [00:15] Hello...
 */
export function formatTranscriptWithTimestamps(transcript: {
  text: string;
  sentences: { text: string; startSeconds: number }[];
}): string {
  if (transcript.sentences && transcript.sentences.length > 0) {
    return transcript.sentences
      .map(
        (sentence) =>
          `${formatTimestamp(sentence.startSeconds)} ${sentence.text}`,
      )
      .join("\n");
  }
  // Fallback to plain text if no sentences available
  return transcript.text;
}

/**
 * Formats transcript as SRT subtitle file format
 */
export function formatTranscriptAsSRT(transcript: {
  text: string;
  sentences: { text: string; startSeconds: number; endSeconds: number }[];
}): string {
  if (!transcript.sentences || transcript.sentences.length === 0) {
    // Fallback: create single subtitle entry for entire transcript
    return `1\n00:00:00,000 --> 00:00:05,000\n${transcript.text}`;
  }

  return transcript.sentences
    .map((sentence, index) => {
      const startTime = formatSRTTime(sentence.startSeconds);
      const endTime = formatSRTTime(sentence.endSeconds);
      return `${index + 1}\n${startTime} --> ${endTime}\n${sentence.text}\n`;
    })
    .join("\n");
}
