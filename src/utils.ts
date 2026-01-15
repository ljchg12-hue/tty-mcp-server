/**
 * Remove ANSI escape codes and trim whitespace from output
 */
export function sanitizeOutput(input: string): string {
  if (!input) return '';

  // Remove ANSI escape codes
  const withoutAnsi = input.replace(/\x1b\[[0-9;]*m/g, '');

  // Trim whitespace
  return withoutAnsi.trim();
}
