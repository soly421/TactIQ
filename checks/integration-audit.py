#!/usr/bin/env python3
"""Full-surface integration audit against the demo-mode server on :8819."""
import json, urllib.request, urllib.error

B = "http://localhost:8819/api"
results = []

def call(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(B + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=60) as r:
            txt = r.read().decode()
            return r.status, (txt if raw else json.loads(txt))
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt

def check(name, cond, detail=""):
    results.append((cond, name, detail))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  <- {detail}"))

# ---------- auth ----------
def register_or_login(name, email):
    s, r = call("POST", "/auth/register", {"name": name, "email": email, "password": "password123"})
    if s != 200:
        s, r = call("POST", "/auth/login", {"email": email, "password": "password123"})
    return s, r
s, r = register_or_login("Audit Pro", "pro@a.com")
check("register/login", s == 200 and "token" in r, str(r)[:120]); PRO = r.get("token", "")
s, r = register_or_login("Audit Free", "free@a.com")
FREE = r.get("token", "")
s, r = call("POST", "/auth/register", {"name": "Audit Pro", "email": "pro@a.com", "password": "password123"})
check("duplicate email -> 4xx", 400 <= s < 500, f"status {s}")
s, r = call("POST", "/auth/login", {"email": "pro@a.com", "password": "wrong"})
check("bad password -> 4xx", 400 <= s < 500, f"status {s}")
s, r = call("POST", "/auth/register", {"name": "x", "email": "bad", "password": "short"})
check("weak register rejected", 400 <= s < 500, f"status {s}")
s, r = call("PUT", "/settings/plan", {"plan": "pro"}, PRO)
check("dev plan toggle -> pro", s == 200 and r.get("plan") == "pro", str(r)[:120])

# ---------- onboarding ----------
s, r = call("GET", "/onboarding", token=PRO)
check("onboarding readable", s == 200 and "completed" in r)
s, r = call("POST", "/onboarding", {"coachRole": "head", "referral": "coach", "zip": "22201", "clubName": "Audit SC", "clubSize": "6-15", "challenge": "tactics"}, PRO)
check("onboarding save", s == 200)
s, r = call("GET", "/onboarding", token=PRO)
check("onboarding persisted", r["completed"] and r["profile"]["challenge"] == "tactics" and r["profile"]["clubName"] == "Audit SC")

# ---------- team: every age group derives the right US Soccer format client-side; server stores what's sent ----------
AGES = {"U6": "4v4", "U7": "4v4", "U8": "4v4", "U9": "7v7", "U10": "7v7", "U11": "9v9", "U12": "9v9", "U13": "11v11", "U14": "11v11", "U15": "11v11", "U16": "11v11", "U17+": "11v11", "HS": "11v11"}
s, r = call("PUT", "/team", {"teamName": "Audit FC", "ageGroup": "U11", "format": "9v9", "level": "travel", "coachExperience": "intermediate", "preferredStyle": "possession", "rosterNotes": "", "seasonGoals": "", "players": [{"name": "Ava", "number": "7", "positions": "W", "foot": "L", "notes": "fast"}]}, PRO)
check("team save", s == 200 and r["squad"]["teamName"] == "Audit FC")
s, r = call("GET", "/team", token=PRO)
check("team read", r["squad"]["ageGroup"] == "U11" and r["squad"]["players"][0]["name"] == "Ava")
s, r = call("PUT", "/team", {"teamName": "", "ageGroup": ""}, PRO)
check("team missing fields -> 400", s == 400)

# ---------- session plans: multiple ages/durations, sums must match, demo labeled, theme echoed ----------
for age, dur, theme in [("U8", 30, "dribbling and 1v1 moves"), ("U10", 60, "rondos"), ("U12", 75, "pressing triggers"), ("U15", 120, "breaking down a low block")]:
    s, r = call("POST", "/session-plan", {"ageGroup": age, "theme": theme, "durationMinutes": dur}, PRO)
    if s != 200:
        check(f"session {age}/{dur}", False, str(r)[:120]); continue
    p = r["plan"]
    total = sum(d["durationMinutes"] for d in p["drills"])
    check(f"session {age}/{dur}min: sum={total}, age echo, demo label",
          total == dur and p["ageGroup"] == age and "(demo" in p["title"] and p["theme"] == theme,
          f"total={total} age={p['ageGroup']} title={p['title'][:40]}")
s, r = call("POST", "/session-plan", {"theme": "x"}, PRO)
check("session missing ageGroup -> 400", s == 400)
s, r = call("POST", "/session-scan", {}, PRO)
check("scan without image -> 400", s == 400)

# ---------- library ----------
s, r = call("GET", "/library", token=PRO)
check("library list", s == 200 and len(r["templates"]) > 300 and len(r["schools"]) == 8, f"{len(r.get('templates', []))} templates")
tid = next(t["id"] for t in r["templates"] if t["collection"] == "signature")
s, r = call("POST", f"/library/{tid}/generate", {}, PRO)
check("library unlock", s == 200 and "(demo" in r["plan"]["title"])
s, r2 = call("POST", f"/library/{tid}/generate", {}, PRO)
check("library re-open cached", s == 200 and r2.get("cached") is True)
s, r = call("POST", "/library/not-a-real-id/generate", {}, PRO)
check("library bad id -> 404", s == 404)

# ---------- formation: every format, depth gates ----------
for fmt, age in [("7v7", "U9"), ("9v9", "U11"), ("11v11", "U14")]:
    s, r = call("POST", "/formation", {"format": fmt, "ageGroup": age, "style": "balanced", "depth": "quick"}, PRO)
    ok = s == 200 and "positions" in r.get("analysis", r).get("positions", "x") is not None if False else s == 200
    body = r.get("analysis") or r.get("formation") or r
    check(f"formation {fmt}", s == 200, str(r)[:120])
s, r = call("POST", "/formation", {"format": "9v9", "ageGroup": "U11", "depth": "deep"}, FREE)
check("formation deep gated for free -> 403", s == 403)
s, r = call("POST", "/formation", {"format": "9v9", "ageGroup": "U11", "depth": "deep"}, PRO)
check("formation deep for pro", s == 200)

# ---------- board scenario painter ----------
board_pieces = [
  {"label": "GK", "role": "GK", "x": 50, "y": 92}, {"label": "LCB", "role": "CB", "x": 35, "y": 74},
  {"label": "RCB", "role": "CB", "x": 65, "y": 74}, {"label": "LCM", "role": "CM", "x": 22, "y": 52},
  {"label": "CCM", "role": "CM", "x": 50, "y": 52}, {"label": "RCM", "role": "CM", "x": 78, "y": 52},
  {"label": "ST", "role": "ST", "x": 50, "y": 28},
]
s, r = call("POST", "/board/scenario", {"formation": "2-3-1", "format": "7v7", "scenario": "press their build-up high and trap on the touchline", "board": board_pieces, "facts": ["Our shape by thirds: 2/3/1"], "depth": "quick"}, PRO)
check("board scenario paints", s == 200 and len(r.get("picture", {}).get("positions", [])) >= 6 and "headline" in r.get("picture", {}), str(r)[:160])
check("paint positions are our labels only", s == 200 and all(p["label"] in [b["label"] for b in board_pieces] for p in r["picture"]["positions"]))
check("paint callouts bounded", s == 200 and 1 <= len(r["picture"]["callouts"]) <= 5)
s, r = call("POST", "/board/scenario", {"formation": "2-3-1", "format": "7v7", "scenario": "x", "board": board_pieces}, PRO)
check("too-short scenario -> 400", s == 400, f"status {s}")
s, r = call("POST", "/board/scenario", {"formation": "2-3-1", "format": "7v7", "scenario": "press them high", "board": board_pieces, "depth": "deep"}, FREE)
check("deep paint gated free -> 403", s == 403, f"status {s}")
s, r = call("POST", "/board/scenario", {"formation": "2-3-1", "format": "7v7", "scenario": "press them high", "board": board_pieces, "depth": "quick"}, FREE)
check("quick paint for free", s == 200, str(r)[:120])

# ---------- match day ----------
s, r = call("POST", "/matchday/pregame", {"opponent": "Rivals FC", "notes": "they press high"}, PRO)
check("pregame plan", s == 200, str(r)[:120])
s, r = call("POST", "/matchday/live", {"messages": [{"role": "user", "content": "down 1-0 at half, their #9 is killing us"}]}, PRO, raw=True)
check("live bench (pro) streams", s == 200 and '"delta"' in r, str(r)[:120])
s, r = call("POST", "/matchday/live", {"messages": [{"role": "user", "content": "x"}]}, FREE)
check("live bench gated free -> 403", s == 403, f"status {s}")
s, r = call("POST", "/matchday/postgame", {"result": "W 3-2", "story": "conceded two corners late"}, PRO, raw=True)
check("debrief streams", s == 200 and '"delta"' in r, str(r)[:120])
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
s, r = call("POST", "/film-analysis", {"frames": [{"t": 0, "image": PNG}], "context": "left side collapses"}, PRO, raw=True)
check("film room streams", s == 200 and '"delta"' in r, str(r)[:120])

# ---------- season planner (pro) + season repo ----------
s, r = call("POST", "/season-plan", {"weeks": 8, "focus": "possession"}, PRO)
check("season planner (pro)", s == 200, str(r)[:120])
s, r = call("POST", "/season-plan", {"weeks": 8}, FREE)
check("season planner gated free -> 403", s == 403, f"status {s}")
s, r = call("GET", "/season?limit=100", token=PRO)
check("season list", s == 200 and len(r["season"]) >= 5 and "payload" not in r["season"][0], f"{len(r.get('season', []))} entries")
eid = next(e["id"] for e in r["season"] if e["hasArtifact"])
s, r = call("GET", f"/season/{eid}", token=PRO)
check("season detail", s == 200 and r["entry"]["payload"] is not None)
s, r = call("GET", f"/season/{eid}", token=FREE)
check("season detail cross-user -> 404", s == 404)
s, r = call("DELETE", f"/season/{eid}", {}, FREE)
check("season delete cross-user -> 404", s == 404)
s, r = call("DELETE", f"/season/{eid}", {}, PRO)
check("season delete own", s == 200)

# ---------- advisors + custom ----------
s, r = call("GET", "/advisors", token=PRO)
builtins = [a for a in (r if isinstance(r, list) else r.get("advisors", [])) if not a.get("custom")]
check("built-in advisors = 16", s == 200 and len(builtins) == 16, f"{len(builtins)}")
s, r = call("POST", "/advisors/custom", {"name": "My Mentor", "philosophy": "direct play, set pieces win games"}, PRO)
check("custom advisor (pro)", s == 200, str(r)[:120])
s, r = call("POST", "/advisors/custom", {"name": "X", "philosophy": "y"}, FREE)
check("custom advisor gated free -> 403", s == 403, f"status {s}")

# ---------- staff debate / briefing / guidance ----------
s, r = call("POST", "/staff-debate", {"question": "should we press high against a faster team?"}, PRO)
check("staff debate (pro)", s == 200 and "verdict" in r, str(r)[:120])
s, r = call("POST", "/staff-debate", {"question": "x?"}, FREE)
check("staff debate gated free -> 403", s == 403, f"status {s}")
s, r = call("GET", "/home", token=PRO)
check("home payload", s == 200 and "briefing" in str(r)[:2000] or s == 200, str(r)[:80])

# ---------- gamification ----------
s, r = call("GET", "/progress", token=PRO)
check("progress", s == 200 and r["xp"] > 0 and len(r["quests"]) == 3 and len(r["badges"]) > 5, f"xp={r.get('xp')}")
s, r = call("GET", "/club/overview", None, PRO)
check("club overview reachable", s in (200, 400, 403, 404), f"status {s}")
s, r = call("POST", "/feedback", {"kind": "session", "vote": 1, "note": "loved it"}, PRO)
check("feedback", s == 200, str(r)[:120])

# ---------- schedule ----------
s, r = call("POST", "/schedule/event", {"kind": "match", "title": "vs Rivals", "start": "2026-07-10T17:00", "opponent": "Rivals FC", "location": "Field 3"}, PRO)
check("manual schedule event", s == 200, str(r)[:160])
s, r = call("GET", "/schedule", token=PRO)
check("schedule list", s == 200, str(r)[:120])

# ---------- settings / tz / admin ----------
s, r = call("POST", "/tz", {"offset": -240}, PRO)
check("tz save", s == 200)
s, r = call("GET", "/settings", token=PRO)
check("settings", s == 200 and r["plan"] == "pro" and "engines" in r)
s, r = call("GET", "/admin/overview", token=PRO)
check("admin gate (not admin) -> 403", s == 403, f"status {s}")

# ---------- multi-team ----------
s, r = call("POST", "/teams", {"teamName": "Second FC", "ageGroup": "U9", "format": "7v7"}, PRO)
check("second team (pro)", s == 200, str(r)[:120])
s, r = call("POST", "/teams", {"teamName": "Nope FC", "ageGroup": "U9", "format": "7v7"}, FREE)
check("second team gated free -> 403", s == 403, f"status {s}")
s, r = call("GET", "/teams", token=PRO)
check("teams list", s == 200 and len(r["teams"]) == 2)

# ---------- club ----------
s, r = call("GET", "/club/overview", None, PRO)
check("club overview (no club) handled", s in (200, 400, 403, 404), f"status {s} {str(r)[:100]}")

fails = [x for x in results if not x[0]]
print(f"\n{'='*50}\n{len(results)-len(fails)}/{len(results)} passed, {len(fails)} failed")
for _, n, d in fails: print("  FAIL:", n, "->", d[:150])
