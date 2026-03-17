import type { SourceFailureClass, SourceFailureReason, SourceName } from "@citecheck/core";
import { ConnectorError } from "./types.js";

export interface HttpRequest {
  source: SourceName;
  url: URL;
  headers?: Record<string, string>;
}

export interface HttpClient {
  get(request: HttpRequest): Promise<string>;
}

export interface SourceHttpPolicy {
  headers?: Record<string, string>;
  apiKey?: string;
  apiKeyHeader?: string;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

export interface FetchHttpClientOptions {
  userAgent?: string;
  defaultTimeoutMs?: number;
  sourcePolicies?: Partial<Record<SourceName, SourceHttpPolicy>>;
}

export class FetchHttpClient implements HttpClient {
  private readonly userAgent: string;
  private readonly defaultTimeoutMs: number;
  private readonly sourcePolicies: Partial<Record<SourceName, SourceHttpPolicy>>;

  public constructor(options: FetchHttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? "citecheck/0.1.0";
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.sourcePolicies = options.sourcePolicies ?? {};
  }

  public async get(request: HttpRequest): Promise<string> {
    const policy = this.sourcePolicies[request.source];
    const controller = new AbortController();
    const timeoutMs = policy?.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(request.url, {
        headers: buildHeaders(this.userAgent, request.headers, policy),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new HttpError(request.source, response.status, response.statusText);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface RetryingHttpClientOptions {
  retries?: number;
  backoffMs?: number;
  sourcePolicies?: Partial<Record<SourceName, SourceHttpPolicy>>;
}

export class RetryingHttpClient implements HttpClient {
  private readonly inner: HttpClient;
  private readonly retries: number;
  private readonly backoffMs: number;
  private readonly sourcePolicies: Partial<Record<SourceName, SourceHttpPolicy>>;

  public constructor(inner: HttpClient, options: RetryingHttpClientOptions = {}) {
    this.inner = inner;
    this.retries = options.retries ?? 0;
    this.backoffMs = options.backoffMs ?? 250;
    this.sourcePolicies = options.sourcePolicies ?? {};
  }

  public async get(request: HttpRequest): Promise<string> {
    const policy = this.sourcePolicies[request.source];
    const retries = policy?.retries ?? this.retries;
    const backoffMs = policy?.backoffMs ?? this.backoffMs;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.inner.get(request);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === retries) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("request failed");
  }
}

export class HttpError extends Error {
  public readonly source: SourceName;
  public readonly status: number;
  public readonly failureClass: SourceFailureClass;
  public readonly failureReason: SourceFailureReason;
  public readonly retryable: boolean;

  public constructor(source: SourceName, status: number, statusText: string) {
    super(`request failed for ${source}: ${status} ${statusText}`);
    this.name = "HttpError";
    this.source = source;
    this.status = status;
    this.failureClass = classifyHttpFailureClass(status);
    this.failureReason = "http_error";
    this.retryable = this.failureClass === "rate_limit_failure" || this.failureClass === "transport_failure";
  }
}

function buildHeaders(
  userAgent: string,
  requestHeaders: Record<string, string> | undefined,
  policy: SourceHttpPolicy | undefined
): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": userAgent,
    accept: "application/json, text/xml;q=0.9, application/xml;q=0.8",
    ...(policy?.headers ?? {}),
    ...(requestHeaders ?? {})
  };
  if (policy?.apiKey && policy.apiKeyHeader) {
    headers[policy.apiKeyHeader] = policy.apiKey;
  }
  return headers;
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof HttpError)) {
    return true;
  }
  return error.retryable;
}

export function toConnectorError(error: unknown, source: SourceName): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }
  if (error instanceof HttpError) {
    return new ConnectorError(source, error.failureClass, error.failureReason, error.message, error.retryable);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ConnectorError(source, "transport_failure", "timeout", `${source} timeout`, true);
  }
  if (error instanceof Error) {
    return new ConnectorError(source, "transport_failure", "unknown_failure", error.message, false);
  }
  return new ConnectorError(source, "transport_failure", "unknown_failure", "connector failed", false);
}

function classifyHttpFailureClass(status: number): SourceFailureClass {
  if (status === 401 || status === 403) {
    return "auth_failure";
  }
  if (status === 429) {
    return "rate_limit_failure";
  }
  return "transport_failure";
}

export function maskSourcePolicies(
  sourcePolicies: Partial<Record<SourceName, SourceHttpPolicy>>
): Partial<Record<SourceName, Omit<SourceHttpPolicy, "apiKey"> & { apiKey?: string }>> {
  return Object.fromEntries(
    Object.entries(sourcePolicies).map(([source, policy]) => [
      source,
      policy
        ? {
            ...policy,
            apiKey: policy.apiKey ? "***masked***" : undefined
          }
        : undefined
    ])
  ) as Partial<Record<SourceName, Omit<SourceHttpPolicy, "apiKey"> & { apiKey?: string }>>;
}
