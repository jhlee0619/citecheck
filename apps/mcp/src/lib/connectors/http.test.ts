import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchHttpClient, HttpError, RetryingHttpClient, maskSourcePolicies } from "./http.js";

describe("http policy support", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("injects source-specific auth headers and masks them in summaries", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FetchHttpClient({
      userAgent: "citecheck-test",
      sourcePolicies: {
        semantic_scholar: {
          apiKey: "secret-key",
          apiKeyHeader: "x-api-key"
        }
      }
    });

    await client.get({
      source: "semantic_scholar",
      url: new URL("https://api.semanticscholar.org/graph/v1/paper/search")
    });

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("secret-key");
    expect(
      maskSourcePolicies({
        semantic_scholar: {
          apiKey: "secret-key",
          apiKeyHeader: "x-api-key"
        }
      }).semantic_scholar?.apiKey
    ).toBe("***masked***");
  });

  it("retries retryable HTTP errors and surfaces non-retryable ones", async () => {
    const inner = {
      get: vi
        .fn()
        .mockRejectedValueOnce(new HttpError("semantic_scholar", 429, "Too Many Requests"))
        .mockResolvedValueOnce("{}")
    };
    const client = new RetryingHttpClient(inner, {
      retries: 1
    });

    const body = await client.get({
      source: "semantic_scholar",
      url: new URL("https://api.semanticscholar.org/graph/v1/paper/search")
    });

    expect(body).toBe("{}");
    expect(inner.get).toHaveBeenCalledTimes(2);
  });

  it("respects retry-after on rate limited responses", async () => {
    vi.useFakeTimers();
    const inner = {
      get: vi
        .fn()
        .mockRejectedValueOnce(new HttpError("crossref", 429, "Too Many Requests", 2_000))
        .mockResolvedValueOnce("{}")
    };
    const client = new RetryingHttpClient(inner, {
      retries: 1,
      backoffMs: 50
    });

    const pending = client.get({
      source: "crossref",
      url: new URL("https://api.crossref.org/works")
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(inner.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe("{}");
    expect(inner.get).toHaveBeenCalledTimes(2);
  });

  it("throttles consecutive requests for the same source", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FetchHttpClient({
      sourcePolicies: {
        crossref: {
          minIntervalMs: 1_000
        }
      }
    });

    const first = client.get({
      source: "crossref",
      url: new URL("https://api.crossref.org/works?query=one")
    });
    await Promise.resolve();
    await first;

    const second = client.get({
      source: "crossref",
      url: new URL("https://api.crossref.org/works?query=two")
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
