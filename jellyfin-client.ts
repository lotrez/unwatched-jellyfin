import { getDefaultUserAgent, createAuthString } from "./jellyfin-utils";

interface QueryResponse {
  colums: string[];
  results: string[][];
  message: string;
}

interface AuthResponse {
  User: any;
  SessionInfo: any;
  AccessToken: string;
  ServerId: string;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  DateCreated: string;
  Type: string;
  UserData?: {
    Played: boolean;
    PlayCount?: number;
    LastPlayedDate?: string;
  };
}

export class JellyfinClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authToken: string | null = null;
  private userId: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  async authenticate() {
    const deviceId = createAuthString(getDefaultUserAgent(), Date.now());
    const response = await fetch(`${this.baseUrl}/Users/authenticatebyname`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="${deviceId}", Version="10.10.7"`,
      },
      body: JSON.stringify({
        Pw: this.password,
        Username: this.username,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jellyfin authentication failed: ${response.status}`);
    }

    const data = (await response.json()) as AuthResponse;
    this.authToken = data.AccessToken;
    this.userId = data.User.Id;
    return data;
  }

  private async ensureAuthenticated() {
    if (!this.authToken) {
      await this.authenticate();
    }
  }

  private async apiRequest(url: string): Promise<any> {
    await this.ensureAuthenticated();
    const response = await fetch(url, {
      headers: {
        "X-MediaBrowser-Token": this.authToken!,
      },
    });

    if (!response.ok) {
      throw new Error(`Jellyfin API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getAllEpisodes() {
    const url = `${this.baseUrl}/Users/${this.userId}/Items?IncludeItemTypes=Episode&Recursive=true&Fields=SeriesName,SeasonIndex,IndexNumber,DateCreated,UserData`;
    const data = await this.apiRequest(url);
    const items = data.Items as JellyfinItem[];

    return items.map((item) => ({
      id: item.Id,
      name: item.Name,
      seriesId: item.SeriesId,
      seriesName: item.SeriesName,
      seasonNumber: item.ParentIndexNumber,
      episodeNumber: item.IndexNumber,
      dateCreated: item.DateCreated,
      played: item.UserData?.Played || false,
    }));
  }

  async getAllMovies() {
    const url = `${this.baseUrl}/Users/${this.userId}/Items?IncludeItemTypes=Movie&Recursive=true&Fields=DateCreated,UserData`;
    const data = await this.apiRequest(url);
    const items = data.Items as JellyfinItem[];

    return items.map((item) => ({
      id: item.Id,
      name: item.Name,
      dateCreated: item.DateCreated,
      played: item.UserData?.Played || false,
    }));
  }

  async getWatchedMedia() {
    const url = `${this.baseUrl}/Users/${this.userId}/Items?IncludeItemTypes=Episode&Recursive=true&Filters=IsPlayed&Fields=SeriesName,SeasonIndex,IndexNumber,DateCreated,UserData`;
    const data = await this.apiRequest(url);
    const items = data.Items as JellyfinItem[];

    return items.map((item) => ({
      itemId: item.Id,
      itemName: item.Name,
      itemType: item.Type,
      lastWatched: item.UserData?.LastPlayedDate,
      maxDuration: 0,
      playCount: item.UserData?.PlayCount || 0,
      seriesName: item.SeriesName,
      dateCreated: item.DateCreated,
    }));
  }

  async executeQuery(query: string): Promise<any[]> {
    await this.ensureAuthenticated();

    const response = await fetch(
      `${this.baseUrl}/user_usage_stats/submit_custom_query?stamp=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-MediaBrowser-Token": this.authToken!,
        },
        body: JSON.stringify({
          CustomQueryString: query,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Jellyfin query failed: ${response.status}`);
    }

    const data = (await response.json()) as QueryResponse;
    
    if (!data.results) {
      return [];
    }

    return data.results;
  }
}
