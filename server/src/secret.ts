import crypto from "node:crypto";

// The single source of truth for the JWT signing secret. auth.ts and
// schedule.ts both sign/verify tokens (session tokens and the TeamSnap OAuth
// state), so they MUST share one secret — a divergence would silently break
// OAuth or, worse, leave one path on a weak default.
//
// Fail closed in production: a hardcoded fallback that ships in the public
// source tree makes every token forgeable, so we refuse to boot without a
// real secret. In dev/test we mint an ephemeral per-boot secret (random, not
// a shared literal) so local runs work without ceremony; it rotates on each
// restart, which is fine for development.
function resolveSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is required in production (set a strong random value on the server). Refusing to start with a default secret.",
    );
  }
  if (fromEnv) {
    console.warn("⚠️  JWT_SECRET is set but shorter than 16 chars — using it anyway (dev only).");
    return fromEnv;
  }
  console.warn("⚠️  JWT_SECRET not set — using an ephemeral per-boot secret (dev only; tokens rotate on restart).");
  return crypto.randomBytes(32).toString("hex");
}

export const JWT_SECRET = resolveSecret();
