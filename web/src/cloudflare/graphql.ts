// Minimal client for the Cloudflare GraphQL Analytics API. Errors never carry the token or the raw response (R5).

export const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export type GraphQLErrorKind = "auth" | "http" | "query" | "network";

export class GraphQLError extends Error {
  constructor(
    readonly kind: GraphQLErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GraphQLError";
  }
}

const MAX_MESSAGE = 200;

export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new GraphQLError("network", "Cloudflare GraphQL API unreachable");
  }

  if (res.status === 401 || res.status === 403) throw new GraphQLError("auth", "Cloudflare rejected the analytics token");
  if (!res.ok) throw new GraphQLError("http", `Cloudflare GraphQL API answered HTTP ${res.status}`);

  let body: { data?: T | null; errors?: { message?: string }[] | null };
  try {
    body = await res.json();
  } catch {
    throw new GraphQLError("http", "Cloudflare GraphQL API answered a non-JSON body");
  }
  if (body.errors?.length) {
    const first = String(body.errors[0]?.message ?? "unknown error").replaceAll(token, "<token>").slice(0, MAX_MESSAGE);
    throw new GraphQLError("query", `Cloudflare GraphQL query failed: ${first}`);
  }
  if (!body.data) throw new GraphQLError("query", "Cloudflare GraphQL API returned no data");
  return body.data;
}
