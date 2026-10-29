import { describe, expect, it } from "vitest";
import { graphql, GraphQLError } from "../src/cloudflare/graphql";

const TOKEN = "dummy-token-value";

function fakeFetch(response: Response | Error): typeof fetch {
  return async () => {
    if (response instanceof Error) throw response;
    return response;
  };
}

async function failure(fetchFn: typeof fetch): Promise<GraphQLError> {
  try {
    await graphql(TOKEN, "{ viewer { __typename } }", {}, fetchFn);
  } catch (error) {
    if (error instanceof GraphQLError) return error;
    throw error;
  }
  throw new Error("expected a GraphQLError");
}

describe("graphql client", () => {
  it("returns the data and sends the token only in the Authorization header", async () => {
    let sent: RequestInit | undefined;
    const fetchFn: typeof fetch = async (_url, init) => {
      sent = init;
      return Response.json({ data: { ok: 1 }, errors: null });
    };
    expect(await graphql<{ ok: number }>(TOKEN, "{ ok }", {}, fetchFn)).toEqual({ ok: 1 });
    expect(new Headers(sent?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(String(sent?.body)).not.toContain(TOKEN);
  });

  const cases: [string, Response | Error, string][] = [
    ["rejected token", new Response("{}", { status: 401 }), "auth"],
    ["server error", new Response("oops", { status: 500 }), "http"],
    ["non-JSON body", new Response("<html>", { status: 200 }), "http"],
    ["query error", Response.json({ data: null, errors: [{ message: `bad field, token ${TOKEN}` }] }), "query"],
    ["no data", Response.json({ data: null, errors: null }), "query"],
    ["network failure", new TypeError("fetch failed"), "network"],
  ];

  for (const [name, response, kind] of cases) {
    it(`R5 reports a ${name} without the token`, async () => {
      const error = await failure(fakeFetch(response));
      expect(error.kind).toBe(kind);
      expect(error.message).not.toContain(TOKEN);
    });
  }
});
