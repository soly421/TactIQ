import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./routes.js";
import { engineFor, hasApiKey } from "./anthropic.js";
import { loadStore } from "./store.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api", api);

// Serve the built client in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  const plan = loadStore().settings.plan;
  console.log(
    `TactIQ server on :${PORT} — plan=${plan} chat=${engineFor(plan, "chat")} structured=${engineFor(plan, "structured")} mode=${hasApiKey ? "LIVE" : "DEMO (no ANTHROPIC_API_KEY)"}`,
  );
});
