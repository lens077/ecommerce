import type { NextRequest } from "next/server";

const DEFAULT_GATEWAY_URL = "http://192.168.3.131:8080";
const REQUEST_HEADERS_TO_DROP = ["connection", "content-length", "host"];
const RESPONSE_HEADERS_TO_DROP = ["connection", "content-length", "transfer-encoding"];

type RouteContext = { params: Promise<{ path: string[] }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const gateway = process.env.CONSUMER_NEXT_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
  const gatewayBase = new URL(gateway.endsWith("/") ? gateway : `${gateway}/`);
  const upstream = new URL(path.map(encodeURIComponent).join("/"), gatewayBase);
  upstream.search = request.nextUrl.search;

  const requestHeaders = new Headers(request.headers);
  for (const name of REQUEST_HEADERS_TO_DROP) {
    requestHeaders.delete(name);
  }

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers: requestHeaders,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
    const responseHeaders = new Headers(response.headers);
    for (const name of RESPONSE_HEADERS_TO_DROP) {
      responseHeaders.delete(name);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "consumer-next gateway proxy unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
