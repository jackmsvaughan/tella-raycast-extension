import { getPreferenceValues } from "@raycast/api";
import type {
  ListVideosParams,
  ListVideosResponse,
  GetVideoResponse,
  UpdateVideoRequest,
  DuplicateVideoRequest,
  StartExportRequest,
  StartExportResponse,
  ListPlaylistsParams,
  ListPlaylistsResponse,
  GetPlaylistResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  UpdatePlaylistRequest,
  AddVideoToPlaylistRequest,
} from "./types";

const API = "https://api.tella.com/v1";

type Preferences = {
  tellaApiKey: string;
};

function getAuthHeaders() {
  const { tellaApiKey } = getPreferenceValues<Preferences>();
  if (!tellaApiKey) {
    throw new Error(
      "Tella API key is required. Set it in extension preferences.",
    );
  }
  return {
    Authorization: `Bearer ${tellaApiKey}`,
    "Content-Type": "application/json",
  };
}

async function tellaFetch<T>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init.headers || {}),
    },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || 0);
    const waitMs = retryAfter ? retryAfter * 1000 : 500 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
    if (attempt < 3) {
      return tellaFetch<T>(path, init, attempt + 1);
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// Video Functions

export async function listVideos(
  params?: ListVideosParams,
): Promise<ListVideosResponse> {
  const searchParams = new URLSearchParams();
  if (params?.cursor) {
    searchParams.append("cursor", params.cursor);
  }
  if (params?.limit) {
    searchParams.append("limit", params.limit.toString());
  }
  if (params?.playlistId) {
    searchParams.append("playlistId", params.playlistId);
  }
  const queryString = searchParams.toString();
  const path = queryString ? `/videos?${queryString}` : "/videos";
  return tellaFetch<ListVideosResponse>(path);
}

export async function getVideo(id: string): Promise<GetVideoResponse> {
  return tellaFetch<GetVideoResponse>(`/videos/${id}`);
}

export async function updateVideo(
  id: string,
  data: UpdateVideoRequest,
): Promise<GetVideoResponse> {
  return tellaFetch<GetVideoResponse>(`/videos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteVideo(id: string): Promise<void> {
  await tellaFetch<{ status: "ok" }>(`/videos/${id}`, {
    method: "DELETE",
  });
}

export async function duplicateVideo(
  id: string,
  name?: string,
): Promise<GetVideoResponse> {
  return tellaFetch<GetVideoResponse>(`/videos/${id}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ name } as DuplicateVideoRequest),
  });
}

export async function startVideoExport(
  id: string,
  data: StartExportRequest,
): Promise<StartExportResponse> {
  return tellaFetch<StartExportResponse>(`/videos/${id}/exports`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Playlist Functions

export async function listPlaylists(
  params?: ListPlaylistsParams,
): Promise<ListPlaylistsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.visibility) {
    searchParams.append("visibility", params.visibility);
  }
  if (params?.cursor) {
    searchParams.append("cursor", params.cursor);
  }
  if (params?.limit) {
    searchParams.append("limit", params.limit.toString());
  }
  const queryString = searchParams.toString();
  const path = queryString ? `/playlists?${queryString}` : "/playlists";
  return tellaFetch<ListPlaylistsResponse>(path);
}

export async function createPlaylist(
  data: CreatePlaylistRequest,
): Promise<CreatePlaylistResponse> {
  return tellaFetch<CreatePlaylistResponse>("/playlists", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPlaylist(id: string): Promise<GetPlaylistResponse> {
  return tellaFetch<GetPlaylistResponse>(`/playlists/${id}`);
}

export async function updatePlaylist(
  id: string,
  data: UpdatePlaylistRequest,
): Promise<GetPlaylistResponse> {
  return tellaFetch<GetPlaylistResponse>(`/playlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deletePlaylist(id: string): Promise<void> {
  await tellaFetch<{ status: "ok" }>(`/playlists/${id}`, {
    method: "DELETE",
  });
}

export async function addVideoToPlaylist(
  playlistId: string,
  videoId: string,
): Promise<void> {
  await tellaFetch<{ status: "ok" }>(`/playlists/${playlistId}/videos`, {
    method: "POST",
    body: JSON.stringify({ videoId } as AddVideoToPlaylistRequest),
  });
}

export async function removeVideoFromPlaylist(
  playlistId: string,
  videoId: string,
): Promise<void> {
  await tellaFetch<{ status: "ok" }>(
    `/playlists/${playlistId}/videos/${videoId}`,
    {
      method: "DELETE",
    },
  );
}
