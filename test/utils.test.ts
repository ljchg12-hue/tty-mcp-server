import { describe, it, expect } from 'vitest';
import { sanitizeOutput } from '../src/utils';

describe('sanitizeOutput', () => {
  it('should remove ANSI escape codes', () => {
    const input = '\x1b[31mRed Text\x1b[0m';
    const result = sanitizeOutput(input);
    expect(result).toBe('Red Text');
  });

  it('should trim whitespace', () => {
    const input = '  hello world  \n';
    const result = sanitizeOutput(input);
    expect(result).toBe('hello world');
  });

  it('should handle empty string', () => {
    const result = sanitizeOutput('');
    expect(result).toBe('');
  });
});
