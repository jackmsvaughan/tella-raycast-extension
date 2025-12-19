import { LocalStorage, getPreferenceValues } from "@raycast/api";
import type { Video, TranscriptSentence } from "./types";

const CACHE_KEY_PREFIX = "tella-videos-cache";
const TRANSCRIPT_CACHE_KEY = "tella-transcripts-cache";

export interface VideoCache {
  videos: Video[];
  fetchedAt: string; // ISO timestamp
  playlistId: string | null; // null = all videos
}

function getCacheKey(playlistId?: string): string {
  return `${CACHE_KEY_PREFIX}-${playlistId || "all"}`;
}

function getCacheDuration(): number {
  try {
    const { cacheDuration } = getPreferenceValues<{ cacheDuration?: string }>();
    return parseInt(cacheDuration || "30", 10);
  } catch {
    return 30; // Default to 30 minutes
  }
}

export async function getVideoCache(
  playlistId?: string,
): Promise<VideoCache | null> {
  try {
    const key = getCacheKey(playlistId);
    const cached = await LocalStorage.getItem<string>(key);
    if (!cached) return null;
    return JSON.parse(cached) as VideoCache;
  } catch {
    return null;
  }
}

export async function setVideoCache(
  videos: Video[],
  playlistId?: string,
): Promise<void> {
  try {
    const key = getCacheKey(playlistId);
    const cache: VideoCache = {
      videos,
      fetchedAt: new Date().toISOString(),
      playlistId: playlistId || null,
    };
    await LocalStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Silently fail - caching is best effort
  }
}

import { CACHE_FRESH_THRESHOLD_MS } from "./utils";

export function isCacheFresh(cache: VideoCache): boolean {
  const duration = getCacheDuration();
  if (duration === 0) return false; // Manual only mode
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  return age < CACHE_FRESH_THRESHOLD_MS;
}

export function isCacheStale(cache: VideoCache): boolean {
  const duration = getCacheDuration();
  if (duration === 0) return false; // Manual only mode
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  const maxAge = duration * 60 * 1000; // Convert minutes to milliseconds
  return age >= CACHE_FRESH_THRESHOLD_MS && age < maxAge;
}

export function isCacheExpired(cache: VideoCache): boolean {
  const duration = getCacheDuration();
  if (duration === 0) return false; // Manual only mode - never auto-expire
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  const maxAge = duration * 60 * 1000; // Convert minutes to milliseconds
  return age >= maxAge;
}

export function getCacheAge(cache: VideoCache): number {
  return Date.now() - new Date(cache.fetchedAt).getTime();
}

export function formatRelativeTime(timestamp: string): string {
  const age = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(age / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// Transcript Cache

export interface CachedTranscript {
  status: "ready" | "processing" | "failed";
  text: string;
  videoName: string;
  sentences?: TranscriptSentence[]; // For timestamp citations in AI chat
}

export interface TranscriptCache {
  transcripts: Record<string, CachedTranscript>; // keyed by videoId
  fetchedAt: string;
}

export async function getTranscriptCache(): Promise<TranscriptCache | null> {
  try {
    const cached = await LocalStorage.getItem<string>(TRANSCRIPT_CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as TranscriptCache;
  } catch {
    return null;
  }
}

export async function setTranscriptCache(
  cache: TranscriptCache,
): Promise<void> {
  try {
    await LocalStorage.setItem(TRANSCRIPT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail - caching is best effort
  }
}

export async function addTranscriptsToCache(
  newTranscripts: Record<string, CachedTranscript>,
): Promise<void> {
  try {
    const existing = await getTranscriptCache();
    const updated: TranscriptCache = {
      transcripts: {
        ...(existing?.transcripts || {}),
        ...newTranscripts,
      },
      fetchedAt: new Date().toISOString(),
    };
    await setTranscriptCache(updated);
  } catch {
    // Silently fail - caching is best effort
  }
}

export async function clearTranscriptCache(): Promise<void> {
  try {
    await LocalStorage.removeItem(TRANSCRIPT_CACHE_KEY);
  } catch {
    // Silently fail - cache clearing is best effort
  }
}

// Duration Cache - lightweight cache for video durations only

const DURATION_CACHE_KEY = "tella-durations-cache";

export interface DurationCache {
  durations: Record<string, number>; // videoId -> durationSeconds
  fetchedAt: string;
}

export async function getDurationCache(): Promise<DurationCache | null> {
  try {
    const cached = await LocalStorage.getItem<string>(DURATION_CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as DurationCache;
  } catch {
    return null;
  }
}

export async function setDurationCache(
  durations: Record<string, number>,
): Promise<void> {
  try {
    const cache: DurationCache = {
      durations,
      fetchedAt: new Date().toISOString(),
    };
    await LocalStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail - caching is best effort
  }
}
