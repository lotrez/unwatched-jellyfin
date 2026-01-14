export class RadarrClient {
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
      throw new Error(`Radarr API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  async getMovies() {
    return this.request<any[]>("/api/v3/movie");
  }

  async getMovieById(movieId: number) {
    return this.request<any>(`/api/v3/movie/${movieId}`);
  }

  async updateMovieMonitored(movieId: number, monitored: boolean) {
    const movie = await this.getMovieById(movieId);
    const updatedMovie = {
      ...movie,
      monitored,
    };
    return this.request<any>(`/api/v3/movie/${movieId}`, {
      method: "PUT",
      body: JSON.stringify(updatedMovie),
    });
  }

  async getMovieFile(movieFileId: number) {
    return this.request<any>(`/api/v3/moviefile/${movieFileId}`);
  }

  async deleteMovieFile(movieFileId: number) {
    const url = `${this.baseUrl}/api/v3/moviefile/${movieFileId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Api-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Radarr API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json();
  }

  async getMovieFiles() {
    return this.request<any[]>("/api/v3/moviefile");
  }
}
