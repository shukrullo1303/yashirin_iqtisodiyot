/**
 * DRF paginated ({ results }) yoki oddiy massiv javoblarini xavfsiz massivga aylantiradi.
 */
export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[]
  }
  if (
    data !== null &&
    typeof data === 'object' &&
    'results' in data &&
    Array.isArray((data as { results: unknown }).results)
  ) {
    return (data as { results: T[] }).results
  }
  return []
}
