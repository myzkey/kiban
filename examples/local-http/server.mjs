import http from "node:http";

const port = Number(process.env.PORT ?? 43110);

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      ok: true,
      name: "kiban-local-http",
      path: request.url,
      pid: process.pid,
      time: new Date().toISOString()
    })
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`local-http listening on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
