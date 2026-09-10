import http from "node:http";
import express from "express";
import { bootstrap } from "@mercuryworkshop/proxy-bootstrap";

const PORT = Number(process.env.PORT) || 3030;

const { routeRequest, routeUpgrade } = await bootstrap();

const app = express();

app.use((req, res, next) => {
  if (routeRequest(req, res)) return;
  next();
});
app.use(express.json());

const SELF_HOSTED = process.env.SELF_HOSTED === "1";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL || "";

if (SELF_HOSTED) {
  const selfHost = RENDER_URL ? RENDER_URL.replace(/^https?:\/\//, "") : (process.env.WISP_HOST || "");
  if (selfHost) {
    const target = `window.__WISP_HOST='${selfHost}'`;
    app.use((req, res, next) => {
      if (req.path === "/" || req.path === "/index.html") {
        const send = res.send.bind(res);
        res.send = (chunk) => {
          if (typeof chunk === "string" && chunk.includes("__WISP_HOST")) {
            chunk = chunk.replace(/window\.__WISP_HOST='[^']*'/, target);
          }
          return send(chunk);
        };
      }
      next();
    });
  }
}

const AI_BACKEND = "https://chudjakbrutalcell.merrittjake65.workers.dev/api/chat";

app.post("/api/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
    if (!messages.length) {
      return res.status(400).json({ error: "messages[] required" });
    }
    const upstream = await fetch(AI_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await upstream.json();
    res.set("Access-Control-Allow-Origin", "*");
    res.status(upstream.status).json(data);
  } catch (err) {
    const msg = String((err && err.message) || err);
    res.status(502).json({ error: msg, fallback: true });
  }
});

app.use(express.static("public"));
app.use(express.static("."));

const server = http.createServer(app);

server.on("upgrade", routeUpgrade);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Scramjet proxy running at http://localhost:${PORT}`);
});
