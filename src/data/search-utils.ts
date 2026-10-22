/**
 * Binary search for prefix matches in a sorted array of lowercased strings.
 *
 * @param sortedWords Array of lowercased and sorted words.
 * @param prefix Lowercased prefix string to match.
 * @param limit Maximum number of results to return.
 * @returns Array of matching words starting with the prefix.
 */
export function binaryPrefixSearch(
  sortedWords: string[],
  prefix: string,
  limit: number
): string[] {
  if (sortedWords.length === 0) return [];

  // Find the insertion point for the prefix
  let lo = 0;
  let hi = sortedWords.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedWords[mid] < prefix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Collect matches from the insertion point
  const results: string[] = [];
  for (let i = lo; i < sortedWords.length && results.length < limit; i++) {
    if (sortedWords[i].startsWith(prefix)) {
      results.push(sortedWords[i]);
    } else {
      break; // No more matches since array is sorted
    }
  }

  return results;
}
