// Draws the contribution graph in the portfolio's grayscale with a pixel cat that strolls
// past it, wakes each week's contributions and naps on the busiest week.
// No dependencies. Usage:
//   GITHUB_TOKEN=... GITHUB_USER=AIKUSAN node pet.mjs [outDir]
//   node pet.mjs [outDir] --input calendar.json   (offline preview)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outDir = (inputIdx === 0 ? args[2] : args[0]) || 'dist';

async function loadCalendar() {
  if (inputIdx !== -1) return JSON.parse(readFileSync(args[inputIdx + 1], 'utf8'));
  const user = process.env.GITHUB_USER;
  const token = process.env.GITHUB_TOKEN;
  if (!user || !token) throw new Error('Set GITHUB_USER and GITHUB_TOKEN, or pass --input <file>.');
  const query = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{date weekday contributionCount contributionLevel}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { u: user } })
  });
  if (!res.ok) throw new Error(`GitHub GraphQL request failed: ${res.status}`);
  return res.json();
}

const THEMES = {
  light: { levels: ['#F4F4F5', '#D1D1D6', '#A1A1AA', '#6B6B73', '#0B0B0D'], muted: '#6B6B73', line: '#E6E6E8', ink: '#0B0B0D' },
  dark: { levels: ['#1B1B1F', '#3A3A41', '#6B6B73', '#A1A1AA', '#F4F4F5'], muted: '#8E8E97', line: '#27272C', ink: '#F4F4F5' }
};
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// The cat, facing right, on a 16 x 12 pixel grid ('#' = ink).
const SPRITES = {
  walkA: [
    '................',
    '..........#...#.',
    '..........##.##.',
    '#.........#####.',
    '#.........#.#.#.',
    '.#........#####.',
    '.#..##########..',
    '..############..',
    '...##########...',
    '...##.....##....',
    '..##.......##...',
    '..#.........#...'
  ],
  walkB: [
    '................',
    '..........#...#.',
    '..........##.##.',
    '..........#####.',
    '##........#.#.#.',
    '..#.......#####.',
    '..#.##########..',
    '..############..',
    '...##########...',
    '....##...##.....',
    '....##...##.....',
    '....#....#......'
  ],
  sit: [
    '................',
    '..........#...#.',
    '..........##.##.',
    '..........#####.',
    '..........##.##.',
    '..........#####.',
    '.....#########..',
    '....##########..',
    '...###########..',
    '..############..',
    '.#.##.##..##.##.',
    '##..............'
  ]
};

const CELL = 10, GAP = 3, STEP = CELL + GAP, PX = 2;
const PAD_X = 8, TOP = 22, PET_W = 16 * PX, PET_H = 12 * PX;

function spriteRects(rows) {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let w = 1;
      while (row[x + w] === '#') w++;
      out.push(`<rect x="${x * PX}" y="${y * PX}" width="${w * PX}" height="${PX}"/>`);
      x += w - 1;
    }
  });
  return out.join('');
}

function render(calendar, theme) {
  const t = THEMES[theme];
  const weeks = calendar.weeks;
  const gridW = weeks.length * STEP - GAP;
  const width = PAD_X * 2 + gridW;
  const gridBottom = TOP + 7 * STEP - GAP;
  const floorY = gridBottom + 14 + PET_H;
  const height = floorY + 22;

  const totals = weeks.map(w => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
  const busiest = totals.indexOf(Math.max(...totals));
  const colX = i => PAD_X + i * STEP;

  // Timeline: walk in from the left, nap on the busiest week, walk out to the right.
  const speed = 42; // px per second
  const start = -PET_W - 8, end = width + 8;
  const napX = colX(busiest) + CELL / 2 - PET_W / 2;
  const tNap = (napX - start) / speed;
  const nap = 3;
  const tOut = tNap + nap + (end - napX) / speed;
  const D = +(tOut + 1.5).toFixed(2);
  const pct = s => +((s / D) * 100).toFixed(3);
  const passTime = x => {
    const center = x - PET_W / 2;
    return center <= napX ? (center - start) / speed : tNap + nap + (center - napX) / speed;
  };

  const starts = [];
  weeks.forEach((w, i) => {
    const m = new Date(w.contributionDays[0].date + 'T00:00:00Z').getUTCMonth();
    if (!starts.length || starts[starts.length - 1].m !== m) starts.push({ i, m });
  });
  if (starts.length > 1 && starts[1].i - starts[0].i < 3) starts.shift();
  const months = starts.filter(s => s.i < weeks.length - 2)
    .map(s => `<text x="${colX(s.i)}" y="${TOP - 8}">${MONTHS[s.m]}</text>`).join('');

  let cols = '';
  weeks.forEach((w, i) => {
    const lit = w.contributionDays.some(d => LEVEL[d.contributionLevel] > 0);
    const delay = passTime(colX(i) + CELL / 2).toFixed(2);
    const cells = w.contributionDays.map(d => {
      const y = TOP + d.weekday * STEP;
      return `<rect x="${colX(i)}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${t.levels[LEVEL[d.contributionLevel]]}"/>`;
    }).join('');
    cols += lit ? `<g class="lit" style="animation-delay:${delay}s">${cells}</g>` : cells;
  });

  const total = calendar.totalContributions;
  const summary = `${total} contributions in the last year; busiest week starting ${weeks[busiest].contributionDays[0].date}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t">
<title id="t">${summary}</title>
<style>
text{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:${t.muted}}
.pet{fill:${t.ink};transform:translate(${napX}px,${floorY - PET_H}px)}
.lit{transform-box:fill-box;animation:wake ${D}s linear infinite}
.pet{animation:stroll ${D}s linear infinite}
.walk{animation:walkvis ${D}s step-end infinite}
.sit{opacity:0;animation:sitvis ${D}s step-end infinite}
.a{animation:legs .32s step-end infinite}
.b{animation:legs .32s step-end -.16s infinite}
@keyframes stroll{
0%{transform:translate(${start}px,${floorY - PET_H}px)}
${pct(tNap)}%{transform:translate(${napX}px,${floorY - PET_H}px)}
${pct(tNap + nap)}%{transform:translate(${napX}px,${floorY - PET_H}px)}
${pct(tOut)}%,100%{transform:translate(${end}px,${floorY - PET_H}px)}}
@keyframes walkvis{0%{opacity:1}${pct(tNap)}%{opacity:0}${pct(tNap + nap)}%{opacity:1}}
@keyframes sitvis{0%{opacity:0}${pct(tNap)}%{opacity:1}${pct(tNap + nap)}%{opacity:0}}
@keyframes legs{0%{opacity:1}50%{opacity:0}}
@keyframes wake{0%{transform:translateY(0)}${pct(0.18)}%{transform:translateY(-3px)}${pct(0.42)}%,100%{transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.pet,.lit,.walk,.sit,.a,.b{animation:none}.walk{opacity:0}.sit{opacity:1}}
</style>
${months}
${cols}
<line x1="${PAD_X}" x2="${width - PAD_X}" y1="${floorY + 0.5}" y2="${floorY + 0.5}" stroke="${t.line}"/>
<text x="${width - PAD_X}" y="${floorY + 15}" text-anchor="end">${total} contributions · last 12 months</text>
<g class="pet"><g class="walk"><g class="a">${spriteRects(SPRITES.walkA)}</g><g class="b">${spriteRects(SPRITES.walkB)}</g></g><g class="sit">${spriteRects(SPRITES.sit)}</g></g>
</svg>
`;
}

const data = await loadCalendar();
const calendar = data.data.user.contributionsCollection.contributionCalendar;
mkdirSync(outDir, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  writeFileSync(`${outDir}/pet-${theme}.svg`, render(calendar, theme));
  console.log(`wrote ${outDir}/pet-${theme}.svg`);
}
