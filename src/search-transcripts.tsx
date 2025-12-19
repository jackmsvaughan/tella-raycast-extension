import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Detail,
  Clipboard,
  open,
} from "@raycast/api";
import { useState, useEffect, useMemo } from "react";
import { listVideos, getVideo } from "./api";
import type { Video, Transcript } from "./types";
import {
  getVideoCache,
  getTranscriptCache,
  addTranscriptsToCache,
  clearTranscriptCache,
  type CachedTranscript,
} from "./cache";
import {
  formatDate,
  FETCH_CONCURRENCY,
  formatTranscriptWithTimestamps,
  formatTranscriptAsSRT,
} from "./utils";

interface VideoWithTranscript {
  video: Video;
  transcript: Transcript | null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatches(text: string, query: string): string {
  if (!query) return text.slice(0, 500) + "...";

  // Get context around the first match
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text.slice(0, 500) + "...";

  // Extract window around match (200 chars before, 300 after)
  const start = Math.max(0, index - 200);
  const end = Math.min(text.length, index + query.length + 300);
  let excerpt = text.slice(start, end);

  if (start > 0) excerpt = "..." + excerpt;
  if (end < text.length) excerpt = excerpt + "...";

  // Highlight matches with inline code (renders with distinct background in Raycast markdown)
  return excerpt.replace(new RegExp(`(${escapeRegex(query)})`, "gi"), "`$1`");
}

// Helper to batch fetch transcripts with concurrency limit
async function fetchTranscripts(
  videos: Video[],
  concurrency = FETCH_CONCURRENCY,
  onProgress?: (current: number, total: number) => void,
): Promise<{
  results: VideoWithTranscript[];
  newTranscripts: Record<string, CachedTranscript>;
}> {
  const results: VideoWithTranscript[] = [];
  const newTranscripts: Record<string, CachedTranscript> = {};

  for (let i = 0; i < videos.length; i += concurrency) {
    const batch = videos.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (video) => {
        try {
          const response = await getVideo(video.id);
          const transcript = response.video.transcript || null;

          // Store in cache format if transcript is ready
          if (transcript && transcript.status === "ready") {
            newTranscripts[video.id] = {
              status: transcript.status,
              text: transcript.text,
              videoName: video.name,
              sentences: transcript.sentences, // Include sentences for AI chat timestamps
            };
          }

          return {
            video,
            transcript,
          };
        } catch {
          // Silently skip failed fetches
          return {
            video,
            transcript: null,
          };
        }
      }),
    );
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    });
    if (onProgress) {
      onProgress(Math.min(i + concurrency, videos.length), videos.length);
    }
  }
  return { results, newTranscripts };
}

export default function SearchTranscripts() {
  const [searchText, setSearchText] = useState("");
  const [videosWithTranscripts, setVideosWithTranscripts] = useState<
    VideoWithTranscript[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Fetching videos...");
  const [loadingProgress, setLoadingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [cachedCount, setCachedCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Convert cached transcript to full Transcript object
  const cachedToTranscript = (cached: CachedTranscript): Transcript => ({
    status: cached.status,
    language: "en", // Default, not critical for search
    text: cached.text,
    sentences: cached.sentences || [], // Include sentences for AI chat timestamps
  });

  // Load videos and fetch transcripts
  const loadTranscripts = async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);
      setLoadingStatus("Fetching videos...");

      // Try to get videos from cache first
      let videos: Video[] = [];
      const videoCache = await getVideoCache();
      if (videoCache && videoCache.videos.length > 0) {
        videos = videoCache.videos;
        setLoadingStatus(`Found ${videos.length} videos in cache`);
      } else {
        // No cache - fetch all videos
        setLoadingStatus("Fetching videos from Tella...");
        const allVideos: Video[] = [];
        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
          const response = await listVideos({ cursor, limit: 50 });
          allVideos.push(...response.videos);
          setLoadingStatus(`Fetched ${allVideos.length} videos...`);
          cursor = response.pagination.nextCursor;
          hasMore = response.pagination.hasMore;
        }
        videos = allVideos;
      }

      if (videos.length === 0) {
        setIsLoading(false);
        return;
      }

      // Get video IDs set for filtering deleted videos
      const videoIds = new Set(videos.map((v) => v.id));

      // Load transcript cache
      let transcriptCache = await getTranscriptCache();

      // If force refresh, clear cache
      if (forceRefresh) {
        await clearTranscriptCache();
        transcriptCache = null;
      }

      // Filter out deleted videos from cache
      if (transcriptCache) {
        const validTranscripts: Record<string, CachedTranscript> = {};
        for (const [videoId, transcript] of Object.entries(
          transcriptCache.transcripts,
        )) {
          if (videoIds.has(videoId)) {
            validTranscripts[videoId] = transcript;
          }
        }
        transcriptCache.transcripts = validTranscripts;
      }

      const cachedIds = new Set(
        Object.keys(transcriptCache?.transcripts || {}),
      );
      const videosToFetch = videos.filter((v) => !cachedIds.has(v.id));
      const cachedTranscriptCount = cachedIds.size;
      const newVideoCount = videosToFetch.length;

      // Track counts for UI
      setCachedCount(cachedTranscriptCount);
      setNewCount(newVideoCount);

      // Build results from cache
      const results: VideoWithTranscript[] = videos.map((video) => {
        const cached = transcriptCache?.transcripts[video.id];
        if (cached && cached.status === "ready") {
          return {
            video,
            transcript: cachedToTranscript(cached),
          };
        }
        return {
          video,
          transcript: null,
        };
      });

      // If all cached, we're done!
      if (videosToFetch.length === 0) {
        setVideosWithTranscripts(results);
        setIsLoading(false);
        setLoadingStatus("All transcripts cached");
        return;
      }

      // Fetch only missing transcripts
      setLoadingProgress({ current: 0, total: videosToFetch.length });
      setLoadingStatus(`Fetching ${videosToFetch.length} new transcripts...`);

      const { results: fetchedResults, newTranscripts } =
        await fetchTranscripts(
          videosToFetch,
          FETCH_CONCURRENCY,
          (current, total) => {
            setLoadingProgress({ current, total });
            setLoadingStatus(`Loading transcripts... ${current}/${total}`);
          },
        );

      // Merge fetched transcripts into results
      const fetchedMap = new Map(fetchedResults.map((r) => [r.video.id, r]));
      const mergedResults = results.map((r) => {
        const fetched = fetchedMap.get(r.video.id);
        return fetched || r;
      });

      // Save new transcripts to cache
      if (Object.keys(newTranscripts).length > 0) {
        await addTranscriptsToCache(newTranscripts);
      }

      setVideosWithTranscripts(mergedResults);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load transcripts",
        message: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTranscripts();
  }, []);

  // Filter videos: show all when browsing, filter when searching
  const filteredVideos = useMemo(() => {
    // No search - show all videos with ready transcripts for browsing
    if (!searchText) {
      return videosWithTranscripts.filter(
        (item) => item.transcript && item.transcript.status === "ready",
      );
    }

    // Search - filter by transcript match
    const query = searchText.toLowerCase();
    return videosWithTranscripts.filter((item) => {
      if (!item.transcript || item.transcript.status !== "ready") return false;
      return item.transcript.text.toLowerCase().includes(query);
    });
  }, [videosWithTranscripts, searchText]);

  // Handle errors
  if (error) {
    const debugInfo = {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      command: "Search Transcripts",
    };
    const debugText = JSON.stringify(debugInfo, null, 2);

    return (
      <Detail
        markdown={`# Error\n\n${error.message}\n\n## Debug Info\n\n\`\`\`json\n${debugText}\n\`\`\`\n\nPress **Enter** to copy debug info.`}
        actions={
          <ActionPanel>
            <Action
              title="Copy Debug Info"
              icon={Icon.Clipboard}
              onAction={async () => {
                await Clipboard.copy(debugText);
                showToast({
                  style: Toast.Style.Success,
                  title: "Debug info copied",
                });
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (isLoading) {
    const progressBar =
      loadingProgress.total > 0
        ? `[${"█".repeat(Math.floor((loadingProgress.current / loadingProgress.total) * 20))}${"░".repeat(20 - Math.floor((loadingProgress.current / loadingProgress.total) * 20))}]`
        : "";

    // Build loading message based on cache state
    let loadingMessage = "";
    if (cachedCount > 0 && newCount > 0) {
      loadingMessage = `## What's happening?\n\n${cachedCount} transcripts cached • ${newCount} new videos found\n\nOnly new videos are being fetched.`;
    } else if (cachedCount === 0 && newCount > 0) {
      loadingMessage = `## What's happening?\n\nTranscripts are being cached locally for instant search.\nAfter this, only new videos will need to be fetched.`;
    } else {
      loadingMessage = `## What's happening?\n\nLoading transcripts...`;
    }

    const markdown = `# Loading Transcripts\n\n${loadingStatus}\n\n${progressBar}\n\n${loadingMessage}\n\n**Tip:** Press ⌘K → "Clear Transcript Cache" to refresh all transcripts.`;

    return (
      <Detail
        markdown={markdown}
        actions={
          <ActionPanel>
            <Action
              title="Clear Transcript Cache"
              icon={Icon.Trash}
              onAction={async () => {
                await clearTranscriptCache();
                showToast({
                  style: Toast.Style.Success,
                  title: "Cache cleared",
                });
                loadTranscripts(true);
              }}
            />
            <Action
              title="Open Cache Folder"
              icon={Icon.Folder}
              onAction={async () => {
                await open("~/Library/Application Support/com.raycast.macos/");
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  const videosWithReadyTranscripts = videosWithTranscripts.filter(
    (item) => item.transcript && item.transcript.status === "ready",
  );

  if (videosWithReadyTranscripts.length === 0) {
    return (
      <List
        searchBarPlaceholder="Search transcripts..."
        onSearchTextChange={setSearchText}
        filtering={false}
        actions={
          <ActionPanel>
            <Action
              title="Refresh Transcripts"
              icon={Icon.ArrowClockwise}
              onAction={() => loadTranscripts(true)}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
            <Action
              title="Clear Transcript Cache"
              icon={Icon.Trash}
              onAction={async () => {
                await clearTranscriptCache();
                showToast({
                  style: Toast.Style.Success,
                  title: "Cache cleared",
                });
                loadTranscripts(true);
              }}
            />
            <Action
              title="Open Cache Folder"
              icon={Icon.Folder}
              onAction={async () => {
                await open("~/Library/Application Support/com.raycast.macos/");
              }}
            />
          </ActionPanel>
        }
      >
        <List.EmptyView
          icon={Icon.Document}
          title="No Transcripts Available"
          description="No videos with ready transcripts found"
        />
      </List>
    );
  }

  return (
    <List
      searchBarPlaceholder="Search transcripts..."
      onSearchTextChange={setSearchText}
      filtering={false}
      isShowingDetail={true}
      actions={
        <ActionPanel>
          <Action
            title="Refresh Transcripts"
            icon={Icon.ArrowClockwise}
            onAction={() => loadTranscripts(true)}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          <Action
            title="Clear Transcript Cache"
            icon={Icon.Trash}
            onAction={async () => {
              await clearTranscriptCache();
              showToast({
                style: Toast.Style.Success,
                title: "Cache cleared",
              });
              loadTranscripts(true);
            }}
          />
          <Action
            title="Open Cache Folder"
            icon={Icon.Folder}
            onAction={async () => {
              await open("~/Library/Application Support/com.raycast.macos/");
            }}
          />
        </ActionPanel>
      }
    >
      {filteredVideos.length === 0 && searchText ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No matches"
          description={`No transcripts found containing "${searchText}"`}
        />
      ) : filteredVideos.length === 0 ? (
        <List.EmptyView
          icon={Icon.Document}
          title="No Transcripts Available"
          description="No videos with ready transcripts found"
        />
      ) : (
        filteredVideos.map((item) => {
          const thumbnailUrl =
            item.video.thumbnails?.small?.jpg ||
            item.video.thumbnails?.medium?.jpg;

          return (
            <List.Item
              key={item.video.id}
              title={item.video.name}
              icon={thumbnailUrl ? { source: thumbnailUrl } : Icon.Document}
              detail={
                item.transcript ? (
                  <List.Item.Detail
                    markdown={(() => {
                      const transcript = item.transcript!;
                      const wordCount = transcript.text
                        .split(/\s+/)
                        .filter((w) => w.length > 0).length;
                      const charCount = transcript.text.length;
                      const matchCount = searchText
                        ? (
                            transcript.text.match(
                              new RegExp(escapeRegex(searchText), "gi"),
                            ) || []
                          ).length
                        : 0;

                      const metadata = [
                        `**Words:** ${wordCount.toLocaleString()}`,
                        `**Characters:** ${charCount.toLocaleString()}`,
                        transcript.language &&
                          `**Language:** ${transcript.language}`,
                        searchText &&
                          matchCount > 0 &&
                          `**Matches:** ${matchCount}`,
                      ]
                        .filter(Boolean)
                        .join(" • ");

                      const transcriptText = searchText
                        ? highlightMatches(transcript.text, searchText)
                        : transcript.text;

                      return `${metadata}\n\n---\n\n${transcriptText}`;
                    })()}
                  />
                ) : (
                  <List.Item.Detail markdown="Transcript not available or still processing." />
                )
              }
              actions={
                <ActionPanel>
                  {item.transcript && item.transcript.status === "ready" && (
                    <>
                      <Action.CopyToClipboard
                        content={item.transcript.text}
                        title="Copy Transcript"
                        icon={Icon.Clipboard}
                        shortcut={{ modifiers: ["cmd"], key: "c" }}
                      />
                      {item.transcript.sentences &&
                        item.transcript.sentences.length > 0 && (
                          <>
                            <Action.CopyToClipboard
                              content={formatTranscriptWithTimestamps(
                                item.transcript,
                              )}
                              title="Copy Transcript with Timestamps"
                              icon={Icon.Clock}
                              shortcut={{
                                modifiers: ["cmd", "shift"],
                                key: "c",
                              }}
                            />
                            <Action.CopyToClipboard
                              content={formatTranscriptAsSRT(item.transcript)}
                              title="Copy Transcript as Srt"
                              icon={Icon.Document}
                              shortcut={{
                                modifiers: ["cmd", "shift"],
                                key: "s",
                              }}
                            />
                          </>
                        )}
                    </>
                  )}
                  <Action.Push
                    title="View Transcript"
                    icon={Icon.Document}
                    target={
                      <TranscriptDetail
                        video={item.video}
                        transcript={item.transcript!}
                        query={searchText}
                      />
                    }
                  />
                  <Action.OpenInBrowser
                    url={item.video.links.viewPage}
                    title="Open Video in Browser"
                  />
                  <Action.CopyToClipboard
                    content={item.video.links.viewPage}
                    title="Copy Video Link"
                  />
                  <Action
                    title="Refresh Transcripts"
                    icon={Icon.ArrowClockwise}
                    onAction={() => loadTranscripts(true)}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                  <Action
                    title="Clear Transcript Cache"
                    icon={Icon.Trash}
                    onAction={async () => {
                      await clearTranscriptCache();
                      showToast({
                        style: Toast.Style.Success,
                        title: "Cache cleared",
                      });
                      loadTranscripts(true);
                    }}
                  />
                  <Action
                    title="Open Cache Folder"
                    icon={Icon.Folder}
                    onAction={async () => {
                      await open(
                        "~/Library/Application Support/com.raycast.macos/",
                      );
                    }}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

function TranscriptDetail({
  video,
  transcript,
  query,
}: {
  video: Video;
  transcript: Transcript;
  query: string;
}) {
  // Highlight query matches in transcript
  const highlightedText = query
    ? transcript.text.replace(
        new RegExp(`(${escapeRegex(query)})`, "gi"),
        "**$1**",
      )
    : transcript.text;

  const markdown = `# ${video.name}\n\n${highlightedText}`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Views"
            text={video.views.toLocaleString()}
          />
          <Detail.Metadata.Label
            title="Date"
            text={formatDate(video.createdAt)}
          />
          <Detail.Metadata.Link
            title="Video"
            target={video.links.viewPage}
            text="Open"
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            content={transcript.text}
            title="Copy Transcript"
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          {transcript.sentences && transcript.sentences.length > 0 && (
            <>
              <Action.CopyToClipboard
                content={formatTranscriptWithTimestamps(transcript)}
                title="Copy Transcript with Timestamps"
                icon={Icon.Clock}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
              <Action.CopyToClipboard
                content={formatTranscriptAsSRT(transcript)}
                title="Copy Transcript as Srt"
                icon={Icon.Document}
                shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
              />
            </>
          )}
          <Action.OpenInBrowser
            url={video.links.viewPage}
            title="Open Video in Browser"
          />
          <Action.CopyToClipboard
            content={video.links.viewPage}
            title="Copy Video Link"
          />
        </ActionPanel>
      }
    />
  );
}
