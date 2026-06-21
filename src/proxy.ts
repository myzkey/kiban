import http from "node:http";
import https from "node:https";
import type net from "node:net";
import type { ProxyConfig } from "./types.js";

export async function startProxy(config: ProxyConfig) {
  const server = http.createServer(createProxyHandler(config));
  server.on("upgrade", createProxyUpgradeHandler(config));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.proxyPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

export function createProxyHandler(config: ProxyConfig) {
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    if (request.url === "/__kibaco/proxy-health") {
      response.writeHead(200, {
        "content-type": "application/json",
        "x-kibaco-proxy": "1"
      });
      response.end(JSON.stringify({ ok: true, proxyPort: config.proxyPort }));
      return;
    }

    const { host, project } = resolveProxyProject(config, request.headers.host);
    if (!project) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end(`No kibaco project matched host: ${host ?? "unknown"}\n`);
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
        response.writeHead(targetResponse.statusCode ?? 502, {
          ...targetResponse.headers,
          "x-kibaco-proxy": "1"
        });
        targetResponse.pipe(response);
      }
    );

    targetRequest.on("error", (error) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(`Failed to proxy ${project.host} to ${project.target}: ${error.message}\n`);
    });

    request.pipe(targetRequest);
  };
}

export function createProxyUpgradeHandler(config: ProxyConfig) {
  return (request: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    if (request.headers.upgrade?.toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }

    const { project } = resolveProxyProject(config, request.headers.host);
    if (!project) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const target = new URL(project.target);
    const requestModule = target.protocol === "https:" ? https : http;
    const targetRequest = requestModule.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: target.host,
        "x-forwarded-host": request.headers.host ?? project.host,
        "x-forwarded-proto": "http"
      }
    });

    const closeBoth = (proxySocket?: net.Socket) => {
      socket.destroy();
      proxySocket?.destroy();
    };

    socket.setTimeout(0);
    targetRequest.on("upgrade", (targetResponse, targetSocket, targetHead) => {
      targetSocket.setTimeout(0);
      socket.write(formatUpgradeResponse(targetResponse));
      if (targetHead.length > 0) socket.write(targetHead);
      if (head.length > 0) targetSocket.write(head);
      targetSocket.on("error", () => closeBoth(targetSocket));
      socket.on("error", () => closeBoth(targetSocket));
      targetSocket.on("close", () => socket.destroy());
      socket.on("close", () => targetSocket.destroy());
      targetSocket.pipe(socket);
      socket.pipe(targetSocket);
    });
    targetRequest.on("error", () => closeBoth());
    targetRequest.end();
  };
}

function resolveProxyProject(config: ProxyConfig, hostHeader: string | undefined) {
  const host = hostHeader?.split(":")[0];
  const project = config.projects.find((item) => item.host === host);
  return { host, project };
}

function formatUpgradeResponse(response: http.IncomingMessage) {
  const statusCode = response.statusCode ?? 101;
  const statusMessage = response.statusMessage || "Switching Protocols";
  const headers = Object.entries(response.headers)
    .flatMap(([name, value]) => (Array.isArray(value) ? value.map((entry) => [name, entry]) : [[name, value]]))
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\r\n");
  return `HTTP/1.1 ${statusCode} ${statusMessage}\r\n${headers}\r\n\r\n`;
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
