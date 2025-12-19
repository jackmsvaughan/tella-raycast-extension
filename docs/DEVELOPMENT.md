# Development Patterns

> This document is kept concise and structured for quick reference — useful for both developers and AI coding assistants.

Coding patterns and conventions for the Tella Raycast extension.

---

## File Structure

```
src/
├── api.ts           # API client with auth, rate limiting, error handling
├── cache.ts         # LocalStorage caching utilities
├── components.tsx   # Shared React components (ErrorDetail)
├── types.ts         # TypeScript interfaces for API responses
├── utils.ts         # Shared utilities and constants
├── browse-videos.tsx
├── browse-playlists.tsx
├── overview.tsx
└── search-transcripts.tsx
```

---

## Error Handling

Use `ErrorDetail` from `src/components.tsx`. Ensure "Copy Debug Info" is the **first action** so Enter copies it.

**Component-level errors** (failed data fetch):
```typescript
if (error) {
  return <ErrorDetail error={error} context={{ command: "Browse Videos" }} />;
}
```

**Action-level errors** (failed delete, duplicate, etc.):
```typescript
const { push } = useNavigation();

try {
  await deleteVideo(id);
} catch (error) {
  push(<ErrorDetail error={error} context={{ action: "Delete", videoId: id }} />);
}
```

**Debug info includes:** error message, stack trace, timestamp, and any context you pass.

---

## Alerts

Use `Alert.ActionStyle.Destructive` for destructive confirmations:

```typescript
await confirmAlert({
  title: "Delete Video",
  message: `Are you sure you want to delete "${video.name}"?`,
  primaryAction: {
    title: "Delete",
    style: Alert.ActionStyle.Destructive, // ✅ Not Alert.Style.Destructive
  },
});
```

---

## Constants

Define in `src/utils.ts`:

```typescript
export const CACHE_FRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const GRID_INITIAL_LOAD = 24;                    // 6 rows × 4 columns
export const FETCH_CONCURRENCY = 5;                     // Concurrent API requests
```

---

## Caching

**Video cache** (`src/cache.ts`):
- Key: `tella-videos-cache`
- Stores full video list in LocalStorage
- Freshness configurable via `cacheDuration` preference
- Background refresh when stale

**Transcript cache** (`src/cache.ts`):
- Key: `tella-transcripts-cache`
- Stores transcripts separately (large content)
- Incremental updates (only fetches new videos)

**User preferences** (LocalStorage):
- `viewMode` — list/grid toggle
- `sortBy` — sort preference

---

## Data Fetching

Use `useCachedPromise` from `@raycast/utils`:

```typescript
const { data, isLoading, revalidate } = useCachedPromise(
  async () => fetchData(),
  [],
  { keepPreviousData: true }
);
```

For pagination, manage cursor state manually and call `revalidate()` to trigger fetches.

---

## API Client

The API client (`src/api.ts`) handles:
- Authentication via Bearer token
- Rate limiting (429) with automatic retry + exponential backoff
- Max 3 retry attempts
- All errors bubble up to UI for `ErrorDetail` handling

---

## Type Safety

- Use types from `src/types.ts`
- No `any` types
- Type guard for errors: `error instanceof Error`

---

## Raycast Specifics

- **Imports:** `@raycast/api` for UI, `@raycast/utils` for hooks
- **Icons:** Use `Icon.*` enum, not custom icons
- **State persistence:** Use `LocalStorage` for user preferences
