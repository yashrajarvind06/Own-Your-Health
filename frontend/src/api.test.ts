import { test, expect, describe, afterEach, vi } from 'vitest';
import { api } from './api';

// Create a mock fetch to test our retry logic
const originalFetch = window.fetch;

describe('API Hardening & Retry Logic', () => {
  afterEach(() => {
    window.fetch = originalFetch;
  });

  test('should return data on successful 200 response', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const result = await api('/test-endpoint');
    expect(result).toEqual({ success: true });
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  test('should map 400 Bad Request to friendly error', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Raw error text from backend',
    });

    await expect(api('/test-endpoint')).rejects.toThrow('Bad request — please check your input.');
    expect(window.fetch).toHaveBeenCalledTimes(1); // Should NOT retry on 4xx
  });

  test('should retry exactly once on 500 Server Error, then fail if still 500', async () => {
    // Mock fetch to always return 500
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    // We expect it to ultimately fail after 1 failure + 1 retry (2 calls total)
    await expect(api('/test-endpoint')).rejects.toThrow('Server error. Please try again shortly.');
    expect(window.fetch).toHaveBeenCalledTimes(2); 
  });

  test('should be successful if 500 fails first time but succeeds on the retry', async () => {
    let callCount = 0;
    window.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 503, text: async () => 'Service unavailable' };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    const result = await api('/test-endpoint');
    expect(result).toEqual({ success: true });
    expect(window.fetch).toHaveBeenCalledTimes(2); // Failed once, retried once, succeeded
  });
});
