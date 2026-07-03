import { chromium } from "playwright-core";

const BASE = "http://localhost:8819";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !t.includes("403")) errors.push("console: " + t.slice(0, 160));
});
const ok = (name, cond, extra = "") => console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  <- " + extra));
const has = async (sel) => (await page.locator(sel).count()) > 0;

await page.goto(BASE);
await page.waitForSelector(".auth-card");
await page.click("text=Sign in");
await page.fill('input[type="email"]', "pro@a.com");
await page.fill('input[type="password"]', "password123");
await page.click("text=Sign in →");
await page.waitForSelector("nav >> text=Ask Coach Sam", { timeout: 9000 });

// ---------- HOME ----------
await page.click("nav >> text=Home");
await page.waitForTimeout(1200);
ok("home renders hero", await has("text=Audit FC") || await has("h1"));
ok("home quests", await has("text=Today's Quests"));
ok("home season activity", await has("text=Season Activity"));

// ---------- CHAT (3 modes) ----------
await page.click("nav >> text=Ask Coach Sam");
await page.waitForTimeout(800);
ok("chat renders", await has("textarea") || await has("input"));
for (const mode of ["Structured answer", "Take it to the staff"]) {
  const btn = page.locator(`button:has-text("${mode}")`).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); ok(`chat mode: ${mode}`, true); }
  else ok(`chat mode: ${mode}`, false, "tab missing");
}

// ---------- ADVISORS ----------
await page.click("nav >> text=Advisors");
await page.waitForTimeout(900);
const advisorCards = await page.locator(".card").count();
ok("advisors grid renders", advisorCards >= 10, `${advisorCards} cards`);
ok("custom advisor builder present", await has("text=/build your own|custom advisor/i"));

// ---------- TRAINING LAB (3 modes) ----------
await page.click("nav >> text=Training Lab");
await page.waitForTimeout(800);
ok("lab design mode", await has("text=Generate Session"));
await page.click("text=Start from the Library");
await page.waitForTimeout(1000);
ok("library renders templates", await has("text=/unlock|Foundations|Progressions/i"));
await page.click("text=My sessions");
await page.waitForTimeout(600);
ok("my sessions repository", await has("text=Your session repository"));

// generate a session end-to-end in the browser
await page.click("text=⚡ Design a session");
await page.waitForTimeout(400);
await page.fill('input[placeholder*="Playing out"]', "switching the point of attack");
await page.click("text=⚡ Generate Session");
await page.waitForSelector("text=/demo sample/i", { timeout: 20000 });
ok("session generates + demo-labeled", true);
const svgs = await page.locator("svg").count();
ok("drill diagrams render", svgs >= 2, `${svgs} svgs`);

// ---------- TACTICS BOARD ----------
await page.click("nav >> text=Tactics Board");
await page.waitForTimeout(900);
// formats and one formation from each
for (const fmt of ["7v7", "9v9", "11v11"]) {
  await page.click(`button:has-text("${fmt}")`);
  await page.waitForTimeout(350);
  ok(`format ${fmt} selectable`, true);
}
// cycle every scenario on 11v11 4-3-3
await page.click("button:has-text('4-3-3')");
await page.waitForTimeout(300);
for (const sc of ["Base Shape", "Build-Up", "High Press", "Mid Block", "Low Block", "Attacking Transition", "Counter-Press", "Wide Attack", "Defending the Cross"]) {
  const b = page.locator(`button:has-text("${sc}")`).first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(500); ok(`scenario: ${sc}`, true); }
  else ok(`scenario: ${sc}`, false, "button missing");
}
ok("opposition picker present", await has("text=Opposition"));
// freehand mode
const freehand = page.locator("button:has-text('Freehand sketch')");
if (await freehand.count()) { await freehand.click(); await page.waitForTimeout(700); ok("freehand board renders", await has("svg")); await page.click("button:has-text('Formations & scenarios')"); }

// ---------- MATCH DAY ----------
await page.click("nav >> text=Match Day");
await page.waitForTimeout(800);
for (const md of ["Pre-game", "Live", "Post-game", "Film"]) {
  const b = page.locator(`button:has-text("${md}")`).first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(400); ok(`matchday tab: ${md}`, true); }
  else ok(`matchday tab: ${md}`, false, "tab missing");
}

// ---------- MY TEAM ----------
await page.click("nav >> text=My Team");
await page.waitForTimeout(900);
ok("team page shows profile", await has('input') || await has("text=Audit FC"));
ok("team page schedule section", await has("text=/schedule|calendar/i"));
ok("danger zone / delete account present", await has("text=Delete account"));

// ---------- COMMUNITY ----------
await page.click("nav >> text=Community");
await page.waitForTimeout(900);
ok("community stat strip", await has("text=XP this week"));
ok("league card", await has("text=/License|Grassroots/"));
ok("promotion race line", await has("text=/promotion|cushion|drop zone/i"));
ok("quests in community", await has("text=Today's Quests"));
ok("trophy case", await has("text=Trophy Case"));
// club toggle
await page.click("button:has-text('My Club')");
await page.waitForTimeout(700);
ok("club toggle renders", await has("text=/club|join|create/i"));

// ---------- PRICING (via upgrade chip after switching to free? just open tab event) ----------
await page.evaluate(() => window.dispatchEvent(new Event("tactiq:pricing")));
await page.waitForTimeout(700);
ok("pricing page renders", await has("text=Founding Coach"));
await page.click("button:has-text('Monthly')");
await page.waitForTimeout(300);
ok("pricing $29.99 (monthly)", await has("text=$29.99"));
ok("pricing club seat $14.99", await has("text=$14.99"));
ok("builds row on matrix", await has("text=Builds per day"));

// ---------- PRIVACY ----------
await page.click("text=Privacy & player data");
await page.waitForTimeout(600);
ok("privacy page renders", await has("text=/first names|privacy/i"));

// ---------- print/export presence ----------
await page.click("nav >> text=Training Lab");
await page.waitForTimeout(500);
await page.click("text=My sessions");
await page.waitForTimeout(500);

console.log(errors.length ? "JS ERRORS (" + errors.length + "):\n" + errors.slice(0, 12).join("\n") : "no JS errors across all tabs");
await browser.close();
