import { createServer } from "node:http";

const port = Number(process.env.POC_GATEWAY_PORT ?? 4010);
const requests = [];

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/__stats") {
    sendJson(response, 200, { requests });
    return;
  }

  if (url.pathname === "/__reset" && request.method === "POST") {
    requests.length = 0;
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname !== "/product.v1.ProductService/GetProductDetail" || request.method !== "POST") {
    sendJson(response, 404, { error: "not found" });
    return;
  }

  const body = JSON.parse((await readBody(request)) || "{}");
  const cookie = request.headers.cookie ?? "";
  const marker = readCookie(cookie, "poc") ?? "none";
  const scope = request.headers["x-consumer-next-scope"] ?? "unscoped";
  const spuCode = typeof body.spuCode === "string" ? body.spuCode : "poc-product";
  requests.push({ marker, scope, spuCode });
  console.log(JSON.stringify({ event: "product-rpc", marker, scope, spuCode }));

  sendJson(response, 200, {
    productDetail: {
      spuId: "1",
      spuName: `POC cookie ${marker}`,
      spuCode,
      commonSpecs: { source: "consumer-next-poc" },
      skus: [
        {
          skuId: "11",
          skuCode: `${spuCode}-sku`,
          merchantId: "00000000-0000-4000-8000-000000000001",
          price: { currencyCode: "CNY", units: "99", nanos: 500000000 },
          costPrice: { currencyCode: "CNY", units: "50", nanos: 0 },
          stockLocked: "0",
          attributes: { cookieMarker: marker },
          specTemplate: [],
          skuName: `Cookie ${marker}`,
          thumbnailUrl: "https://example.invalid/consumer-next-poc.png",
          status: "STATUS_ONLINE",
        },
      ],
    },
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`POC gateway listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function readCookie(header, name) {
  for (const pair of header.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }
  return undefined;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, status, body) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  response.end(json);
}
