import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchHttpClient, HttpError, RetryingHttpClient, maskSourcePolicies } from "./http.js";

describe("http policy support", () => {
  afterEach(() => {
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
});
