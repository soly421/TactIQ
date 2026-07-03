import { FORMATIONS, SCENARIOS, applyScenario } from "./formations.bundle.mjs";
let bad = 0, checked = 0;
for (const f of FORMATIONS) {
  for (const s of SCENARIOS) {
    const ps = applyScenario(f, s.id);
    checked++;
    // 1. no two pieces closer than 5 grid units
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
      if (d < 5) { console.log(`COLLISION ${f.name} / ${s.name}: ${ps[i].label}(${ps[i].x.toFixed(0)},${ps[i].y.toFixed(0)}) vs ${ps[j].label} d=${d.toFixed(1)}`); bad++; }
    }
    // 2. GK must be the deepest player in every defensive-phase picture
    if (["midblock","lowblock","defCross","base"].includes(s.id)) {
      const gk = ps.find(p => p.role === "GK");
      const deepest = Math.max(...ps.filter(p => p.role !== "GK").map(p => p.y));
      if (gk && gk.y <= deepest) { console.log(`GK NOT DEEPEST ${f.name} / ${s.name}: gk=${gk.y} deepest=${deepest}`); bad++; }
    }
    // 3. in a press the back line must be at or above halfway+5; in a low block everyone (minus outlet) behind 60
    if (s.id === "highpress") {
      const backs = ps.filter(p => ["CB"].includes(p.role));
      if (backs.some(b => b.y > 55)) { console.log(`PRESS BACK LINE DEEP ${f.name}: ${backs.map(b=>b.y)}`); bad++; }
    }
    if (s.id === "lowblock") {
      const out = ps.filter(p => p.y < 55).length;
      if (out > 1) { console.log(`LOW BLOCK LEAKY ${f.name}: ${out} players high`); bad++; }
    }
    // 4. defending the cross: at least 2 zonal defenders at y>=85
    if (s.id === "defCross") {
      const zonal = ps.filter(p => p.y >= 84 && p.role !== "GK").length;
      if (zonal < 2) { console.log(`CROSS BOX EMPTY ${f.name}: ${zonal} zonal`); bad++; }
    }
    // 5. all pieces on the pitch
    for (const p of ps) if (p.x < 2 || p.x > 98 || p.y < 2 || p.y > 98) { console.log(`OFF PITCH ${f.name}/${s.name} ${p.label}`); bad++; }
  }
}
console.log(`\n${checked} formation×scenario combos checked, ${bad} problems`);
