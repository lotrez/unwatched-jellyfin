export class SonarrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Sonarr API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async getSeries() {
    return this.request<any[]>("/api/v3/series");
  }

  async getSeriesWithEpisodes(seriesId: number) {
    return this.request<any>(`/api/v3/series/${seriesId}?includeEpisodes=true`);
  }

  async updateSeries(seriesId: number, data: any) {
    return this.request<any>(`/api/v3/series/${seriesId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getEpisodesBySeriesId(seriesId: number) {
    return this.request<any[]>(
      `/api/v3/episode?seriesId=${seriesId}`
    );
  }

  async getEpisodeFile(episodeFileId: number) {
    return this.request<any>(`/api/v3/episodefile/${episodeFileId}`);
  }

  async deleteSeries(seriesId: number, deleteFiles: boolean = true) {
    return this.request(`/api/v3/series/${seriesId}?deleteFiles=${deleteFiles}`, {
      method: "DELETE",
    });
  }

  async deleteEpisodeFile(episodeFileId: number) {
    return this.request(`/api/v3/episodefile/${episodeFileId}`, {
      method: "DELETE",
    });
  }

  async getEpisodeFiles() {
    return this.request<any[]>("/api/v3/episodefile");
  }
}
