import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { requireAuth, type AuthedRequest } from "./auth.js";
import {
  findClubByStripeCustomer, findUserByStripeCustomer, getClubBilling, getUserBilling,
  getUserClub, setClubLicense, setPlanTier, setStripeIds,
} from "./store.js";

// ============================================================================
// Stripe subscription billing for the Pro tier.
//
// When STRIPE_SECRET_KEY + STRIPE_PRICE_ID_PRO are set, the plan tier becomes
// server-authoritative: it only changes through verified Stripe webhooks
// (checkout completed, subscription updated/canceled) — never through client
// requests. Without Stripe config, the app keeps the dev plan toggle so local
// and demo environments still work.
// ============================================================================

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_PRO);

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return stripe;
}

function baseUrl(req: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  return `${proto}://${req.headers.host}`;
}

export const billingRouter = Router();
billingRouter.use(requireAuth);

function uid(req: unknown): number {
  return (req as AuthedRequest).userId;
}

// Start a subscription checkout for the Pro tier.
billingRouter.post("/checkout", async (req, res) => {
  if (!stripeConfigured) {
    res.status(400).json({ error: "Billing is not configured on this server." });
    return;
  }
  const userId = uid(req);
  const billing = getUserBilling(userId);
  if (!billing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_PRO as string, quantity: 1 }],
      client_reference_id: String(userId),
      ...(billing.stripeCustomerId ? { customer: billing.stripeCustomerId } : { customer_email: billing.email }),
      subscription_data: { metadata: { tactiqUserId: String(userId) } },
      success_url: `${baseUrl(req)}/?billing=success`,
      cancel_url: `${baseUrl(req)}/?billing=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("stripe checkout error", err);
    res.status(500).json({ error: "Couldn't start checkout. Try again." });
  }
});

// Club seat licensing: the DOC/admin buys N Pro seats for the whole club in
// one subscription (quantity = seats). Requires STRIPE_PRICE_ID_CLUB_SEAT.
billingRouter.post("/club-checkout", async (req, res) => {
  if (!stripeConfigured || !process.env.STRIPE_PRICE_ID_CLUB_SEAT) {
    res.status(400).json({ error: "Club billing is not configured on this server." });
    return;
  }
  const userId = uid(req);
  const club = getUserClub(userId);
  if (!club || club.role !== "admin") {
    res.status(403).json({ error: "Only the club admin can buy a club license." });
    return;
  }
  const seats = Math.min(200, Math.max(1, Number(req.body?.seats) || 1));
  const billing = getUserBilling(userId);
  const clubBilling = getClubBilling(club.id);
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_CLUB_SEAT, quantity: seats }],
      client_reference_id: `club:${club.id}`,
      ...(clubBilling?.stripeCustomerId ? { customer: clubBilling.stripeCustomerId } : { customer_email: billing?.email }),
      subscription_data: { metadata: { tactiqClubId: String(club.id), seats: String(seats) } },
      success_url: `${baseUrl(req)}/?billing=success`,
      cancel_url: `${baseUrl(req)}/?billing=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("stripe club checkout error", err);
    res.status(500).json({ error: "Couldn't start club checkout. Try again." });
  }
});

// Open the Stripe customer portal (manage/cancel subscription, update card).
billingRouter.post("/portal", async (req, res) => {
  if (!stripeConfigured) {
    res.status(400).json({ error: "Billing is not configured on this server." });
    return;
  }
  const billing = getUserBilling(uid(req));
  if (!billing?.stripeCustomerId) {
    res.status(400).json({ error: "No billing profile yet — upgrade first." });
    return;
  }
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${baseUrl(req)}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("stripe portal error", err);
    res.status(500).json({ error: "Couldn't open the billing portal. Try again." });
  }
});

// Signature-verified webhook. Mounted with express.raw BEFORE the JSON parser
// (Stripe signatures are computed over the exact raw body).
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  if (!stripeConfigured || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ error: "not configured" });
    return;
  }
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      req.headers["stripe-signature"] as string,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    res.status(400).json({ error: "invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const ref = session.client_reference_id ?? "";
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (ref.startsWith("club:") && customerId) {
          const clubId = Number(ref.slice(5));
          // Seat count comes from the subscription's line-item quantity.
          let seats = 1;
          if (subscriptionId) {
            const sub = await getStripe().subscriptions.retrieve(subscriptionId);
            seats = sub.items.data[0]?.quantity ?? 1;
          }
          setClubLicense(clubId, "pro", seats, customerId, subscriptionId ?? undefined);
          console.log(`[billing] club ${clubId} licensed: ${seats} pro seats (sub ${subscriptionId})`);
        } else if (Number(ref) && customerId) {
          const userId = Number(ref);
          setStripeIds(userId, customerId, subscriptionId ?? null);
          setPlanTier(userId, "pro");
          console.log(`[billing] user ${userId} upgraded to pro (sub ${subscriptionId})`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
        const clubId = findClubByStripeCustomer(customerId);
        if (clubId) {
          const seats = sub.items.data[0]?.quantity ?? 1;
          setClubLicense(clubId, active ? "pro" : "free", active ? seats : 0);
          console.log(`[billing] club ${clubId} subscription ${sub.status} -> ${active ? `pro x${seats}` : "free"}`);
          break;
        }
        const userId = findUserByStripeCustomer(customerId);
        if (userId) {
          setPlanTier(userId, active ? "pro" : "free");
          console.log(`[billing] user ${userId} subscription ${sub.status} -> ${active ? "pro" : "free"}`);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const clubId = findClubByStripeCustomer(customerId);
        if (clubId) {
          setClubLicense(clubId, "free", 0);
          console.log(`[billing] club ${clubId} license canceled -> free`);
          break;
        }
        const userId = findUserByStripeCustomer(customerId);
        if (userId) {
          setPlanTier(userId, "free");
          console.log(`[billing] user ${userId} subscription canceled -> free`);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log and 200 anyway: Stripe retries on non-2xx, and a handler bug should
    // not build an unbounded retry queue. The event log in Stripe is the audit trail.
    console.error(`stripe webhook handler error for ${event.type}`, err);
  }
  res.json({ received: true });
}
