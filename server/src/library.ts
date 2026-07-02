// The Session Library: a curated catalog of session templates spanning the
// world's coaching schools of thought. Templates are metadata; "unlocking" one
// hydrates it into a full visualized plan via structured generation, matched to
// the coach's team. Generated plans are cached in the store.

export interface School {
  id: string;
  name: string;
  region: string;
  emoji: string;
  description: string;
}

export const SCHOOLS: School[] = [
  { id: "spanish", name: "Spanish Positional School", region: "Spain", emoji: "🇪🇸", description: "Rondos, positional games, the free man, build-up bravery. The La Masia lineage: small spaces, big brains." },
  { id: "dutch", name: "Dutch Total Football", region: "Netherlands", emoji: "🇳🇱", description: "4v4/7v7 as the teaching game, universal players, width and diagonals, the famous Ajax individual-technique obsession." },
  { id: "german", name: "German Pressing Academy", region: "Germany", emoji: "🇩🇪", description: "Gegenpressing, transition moments, intensity as a skill. The modern Bundesliga youth blueprint." },
  { id: "italian", name: "Italian Defensive Craft", region: "Italy", emoji: "🇮🇹", description: "The art of defending: shape, duels, reading the game, tactical intelligence from the back forward." },
  { id: "southam", name: "South American Street & Futsal", region: "Brazil / Argentina", emoji: "🌎", description: "Futsal foundations, 1v1 audacity, improvisation, the ball as your best friend. Joy first, structure second." },
  { id: "english", name: "English Direct & Duels", region: "England", emoji: "🏴", description: "Tempo, physical duels, set pieces, wide service and box presence. The championship DNA, modernized for youth." },
  { id: "french", name: "French Athletic Development", region: "France", emoji: "🇫🇷", description: "The Clairefontaine pathway: athletic base, 1v1 domination both ways, technical repetition at speed." },
  { id: "usa", name: "US Pathway (Club → HS → College)", region: "USA", emoji: "🇺🇸", description: "Built for the American reality: big rosters, limited practice time, multi-sport athletes, HS intensity and college recruiting." },
];

export interface SessionTemplate {
  id: string;
  school: string; // school id
  title: string;
  format: "7v7" | "9v9" | "11v11" | "HS";
  zone: "Zone 1" | "Zone 2" | "HS";
  ageBand: string;
  theme: string;
  description: string;
}

// zone mapping: 7v7 & 9v9 → Zone 1 (U8-U12), 11v11 → Zone 2 (U13-U16), HS → high school
const T = (school: string, title: string, format: SessionTemplate["format"], ageBand: string, theme: string, description: string): SessionTemplate => ({
  id: `${school}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
  school,
  title,
  format,
  zone: format === "HS" ? "HS" : format === "11v11" ? "Zone 2" : "Zone 1",
  ageBand,
  theme,
  description,
});

export const SESSION_TEMPLATES: SessionTemplate[] = [
  // Spanish positional
  T("spanish", "The Rondo Ladder", "7v7", "U8-U10", "Passing under pressure", "From 4v1 to 5v2 to positional rondo — the complete rondo progression that builds the pass-move-scan habit."),
  T("spanish", "Finding the Free Man", "9v9", "U10-U12", "Build-up through the lines", "3+1 build-up vs pressing pairs: recognize where the spare man is and play through him bravely."),
  T("spanish", "The Third Man Runs the Game", "11v11", "U13-U15", "Third-man combinations", "Positional game to 11v11 phases: bounce passes, blindside runs, and combinations a press can't follow."),
  T("spanish", "Playing Out vs a High Press", "11v11", "U14-U16", "Goal-kick build-up", "Structured goal-kick patterns against man-pressure — the keeper as +1, splitting CBs, midfield rotations."),
  T("spanish", "Overload to Isolate", "HS", "HS", "Switching play to the winger", "Draw the block to one side with combination play, then release the far-side 1v1 — full session from pattern to game."),
  T("spanish", "Positional Game 4-3-3", "9v9", "U11-U12", "Lane discipline & rotations", "Five-lane grid games teaching when to hold width, when to rotate inside, and who covers."),

  // Dutch total football
  T("dutch", "4v4 The Ajax Way", "7v7", "U8-U10", "Universal skills in the smallest game", "The classic 4v4 diet: diamond shapes, quick switches, every player attacking and defending every rep."),
  T("dutch", "Wingers Stay Wide", "9v9", "U10-U12", "Width, diagonals & crossing angles", "Chalk-on-boots width to stretch defenses, diagonal balls behind, and the timing of when to come inside."),
  T("dutch", "The Interchange Engine", "11v11", "U13-U15", "Positional rotations in a 4-3-3", "Midfield three rotations with the winger-fullback swap — total football rotations made teachable."),
  T("dutch", "Technique Under Fatigue", "HS", "HS", "First touch & passing at intensity", "Dutch technical circuits at match tempo, then transferred straight into overload games."),
  T("dutch", "One-Touch World", "7v7", "U9-U11", "Combination speed", "Wall passes, third-man bounces, one-touch finishing — a session where two touches feels slow."),

  // German pressing
  T("german", "The 5-Second Rule", "9v9", "U11-U12", "Counter-pressing after loss", "Transition games where losing the ball triggers the hunt: nearest three press, everyone else cuts the exits."),
  T("german", "Pressing Triggers", "11v11", "U13-U15", "When to jump: reading the press moment", "Bad touch, back pass, sideline — trigger recognition drills building into an 11v11 pressing phase play."),
  T("german", "Vertical in Three Passes", "11v11", "U14-U16", "Fast attacks after winning the ball", "Win it, play forward, finish — max three passes. Rest-defense structure included so it isn't chaos."),
  T("german", "Gegenpress Gauntlet", "HS", "HS", "Full-pitch pressing endurance", "Wave pressing games at HS intensity: recover, reorganize, re-press. Conditioning disguised as tactics."),
  T("german", "First Press for Little Legs", "7v7", "U8-U10", "Intro to pressing as a game", "Tag-based and numbers-up chasing games that teach curve runs and 'press together' without lectures."),

  // Italian defensive craft
  T("italian", "The Art of the Duel", "9v9", "U10-U12", "1v1 defending fundamentals", "Body shape, approach angle, jockey, tackle timing — the full Italian duel curriculum in game form."),
  T("italian", "Catenaccio for Kids (The Good Parts)", "11v11", "U13-U15", "Compact block & cover", "Back-four shifting, cover shadows, and the libero's reading of danger — organized defending as craft."),
  T("italian", "Defending the Box", "HS", "HS", "Low-block & box defending", "Crosses, cutbacks, second balls: a full session on winning your box when the game turns ugly."),
  T("italian", "Delay, Deny, Destroy", "11v11", "U14-U16", "Defensive transitions", "What to do the second you lose it when you CAN'T win it back: delay the counter, recover, reset the block."),
  T("italian", "Smart Fouls... er, Smart Pressure", "9v9", "U11-U12", "Defending without diving in", "When to engage vs contain — decision games that end the lunge-and-beaten cycle."),

  // South American street & futsal
  T("southam", "Futsal Friday", "7v7", "U8-U12", "Tight-space technique", "A full futsal-rules session: sole rolls, toe pokes, pivot play — the Brazilian skill engine."),
  T("southam", "The Nutmeg Economy", "7v7", "U8-U11", "1v1 audacity", "1v1 arenas with skill bonuses: points for meg, feint, chop. Bravery scored louder than goals."),
  T("southam", "Potrero Games", "9v9", "U10-U13", "Street soccer decision-making", "Uneven teams, weird pitches, changing rules — Argentine potrero chaos that builds improvisers."),
  T("southam", "The Enganche Session", "11v11", "U13-U16", "Playing through a #10", "Finding and freeing the creator between lines: disguised passes, receiving on the half-turn, the killer ball."),
  T("southam", "Ginga & Go", "HS", "HS", "Flair in the final third", "Skill moves at speed with end product: beat your man, then deliver. Expression with a scoreboard."),

  // English direct & duels
  T("english", "Put It In The Mixer", "11v11", "U14-U16", "Crossing & box arrivals", "Wide service volume: early crosses, cutbacks, near/far-post movement patterns, and second-ball reactions."),
  T("english", "Set-Piece Money Session", "HS", "HS", "Corners & free kicks both ways", "Three attacking routines, one defensive system, and the long throw — the free-goals session."),
  T("english", "Second Ball Warriors", "9v9", "U11-U13", "Winning the knockdown", "Duel circuits and second-ball games — the unglamorous skill that decides direct games."),
  T("english", "Front-Foot Defending", "11v11", "U13-U15", "Aggressive defending & long build resistance", "Defend forward: intercept, step in, win it high without fouling."),
  T("english", "Tempo!", "HS", "HS", "Playing at match speed", "Everything at 100%: fast restarts, quick throws, transition finishing. The English intensity session."),

  // French athletic development
  T("french", "1v1 Both Ways", "9v9", "U10-U13", "Dominating duels attacking & defending", "The Clairefontaine staple: 1v1s in every direction, every angle, attacking and defending reps equal."),
  T("french", "Technique at Speed", "7v7", "U9-U11", "Ball mastery under time pressure", "High-repetition technical circuits with sprint elements — clean feet on tired legs."),
  T("french", "The Athletic 8", "11v11", "U13-U15", "Box-to-box midfield development", "Building the complete midfielder: receiving under pressure, carrying, arriving late, recovering."),
  T("french", "Speed Endurance Finishing", "HS", "HS", "Finishing under fatigue", "Repeated sprint efforts into finishing patterns — score when your legs are gone."),
  T("french", "Coordination & Ball", "7v7", "U8-U10", "Movement skills with every touch", "Ladders, hops and turns woven into ball work — the athletic base without losing the ball."),

  // US pathway
  T("usa", "Big Roster, Big Engagement", "9v9", "U10-U12", "Max touches with 14+ kids", "Station-based design that keeps an American-sized roster moving — zero lines, zero standing."),
  T("usa", "The 90-Minute Week", "11v11", "U13-U15", "One-practice-a-week team session", "When you only get one session: the highest-transfer 90 minutes possible before Saturday."),
  T("usa", "Tryout Week Evaluator", "9v9", "U11-U14", "Assessment session with fair looks", "Games and measurable stations designed so every kid gets evaluated in every phase."),
  T("usa", "HS Preseason Day One", "HS", "HS", "Culture + fitness + first principles", "The first practice: standards, competitive fitness with the ball, and your core game model installed."),
  T("usa", "Multi-Sport Athlete Fast-Track", "HS", "HS", "Soccer IQ for great athletes", "For the basketball player who joined in August: decision-making patterns that convert athleticism to soccer."),
  T("usa", "College Showcase Prep", "HS", "HS", "Playing your role on camera", "Position-specific detail and team patterns that make players legible to recruiters in showcase games."),
];

export function getTemplate(id: string): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((t) => t.id === id);
}
