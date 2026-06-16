import http from "node:http";
import type { ProxyConfig } from "./types.js";

export async function startProxy(config: ProxyConfig) {
  const server = http.createServer((request, response) => {
    const host = request.headers.host?.split(":")[0];
    const project = config.projects.find((item) => item.host === host);
    if (!project) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end(`No kiban project matched host: ${host ?? "unknown"}\n`);
      return;
    }

    const target = new URL(project.target);
    const targetRequest = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.url,
        headers: {
          ...request.headers,
          host: target.host,
          "x-forwarded-host": request.headers.host ?? project.host,
          "x-forwarded-proto": "http"
        }
      },
      (targetResponse) => {
        response.writeHead(targetResponse.statusCode ?? 502, targetResponse.headers);
        targetResponse.pipe(response);
      }
    );

    targetRequest.on("error", (error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(`Failed to proxy ${project.host} to ${project.target}: ${error.message}\n`);
    });

    request.pipe(targetRequest);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.proxyPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

export function proxyUrl(config: ProxyConfig, host: string) {
  const port = config.proxyPort === 80 ? "" : `:${config.proxyPort}`;
  return `http://${host}${port}`;
}

export function targetPort(target: string) {
  try {
    const url = new URL(target);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return undefined;
  }
}
