export function responseLiveTime(response: Response) {
  const value =
    response.headers.get("X-Last-Live-At") ?? response.headers.get("Date");
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}
