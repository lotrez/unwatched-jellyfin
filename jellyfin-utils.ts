export const createAuthString = (
  userAgent: string,
  timestamp: number = Date.now(),
): string => {
  const combinedString = `${userAgent}|${timestamp}`;
  return btoa(combinedString);
};

export const getDefaultUserAgent = (): string => {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
};
