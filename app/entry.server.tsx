import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { validateEnv } from "./lib/env.server";

validateEnv();

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  const url = new URL(request.url);
  const isPortal = url.pathname.startsWith("/portal");
  const isProd = process.env.NODE_ENV === "production";

  // Skip Shopify headers for portal routes (they run outside the Shopify iframe)
  if (!isPortal) {
    addDocumentResponseHeaders(request, responseHeaders);
  }

  // Security headers for all routes
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  responseHeaders.set("X-DNS-Prefetch-Control", "off");
  responseHeaders.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );
  responseHeaders.delete("Server");
  responseHeaders.delete("X-Powered-By");

  // Portal-only headers (can't use X-Frame-Options or strict CSP on Shopify embedded routes)
  if (isPortal) {
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    responseHeaders.set(
      "Content-Security-Policy",
      isProd
        ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.shopify.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.shopify.com; font-src 'self'; connect-src 'self' ws://localhost:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
    responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    responseHeaders.set("Pragma", "no-cache");
  }
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (typeof error === "object" && error !== null && "message" in error) {
            const { logger } = require("./lib/logger.server");
            logger.error("React render error", { error: (error as Error).message });
          }
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
