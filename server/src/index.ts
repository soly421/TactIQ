import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./routes.js";
import { authRouter } from "./auth.js";
import { clubRouter } from "./club.js";
import { billingRouter, stripeConfigured, stripeWebhook } from "./billing.js";
import { scheduleRouter } from "./schedule.js";
import { availableProviders, engineSummary, hasAnyProvider } from "./providers.js";
import { emailConfigured, startDigestScheduler } from "./email.js";

const app = express();
app.use(cors());
// Stripe webhook must see the exact raw body for signature verification —
// mounted BEFORE the JSON parser.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => void stripeWebhook(req, res));
app.use(express.json({ limit: "10mb" }));
app.use("/api/auth", authRouter);
app.use("/api/club", clubRouter);
app.use("/api/billing", billingRouter);
app.use("/api/schedule", scheduleRouter);
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
  const free = engineSummary("free");
  const pro = engineSummary("pro");
  console.log(
    `TactIQ server on :${PORT}\n` +
      `  providers: ${availableProviders().join(" -> ") || "none (DEMO mode)"}\n` +
      `  engines: free=${free.chat.label} (${free.chat.model}) / ${free.structured.label} (${free.structured.model}); pro=${pro.chat.label} (${pro.chat.model})\n` +
      `  billing: ${stripeConfigured ? "Stripe LIVE" : "not configured — dev plan toggle active"}\n` +
      `  email: ${emailConfigured ? "Resend LIVE (weekly digest armed)" : "not configured"}\n` +
      `  mode: ${hasAnyProvider() ? "LIVE" : "DEMO"}`,
  );
  startDigestScheduler();
});
