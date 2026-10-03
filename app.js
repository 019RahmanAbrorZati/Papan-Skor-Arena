const KEY = "arena.papan";

const RULES = {
  futsal: {
    label: "Futsal",
    periods: ["Babak 1", "Babak 2"],
    periodSeconds: 20 * 60,
    otSeconds: 5 * 60,
    points: [1],
    fouls: true,
    bonus: 5,
    scoreWord: "Gol",
    nextLabel: "Babak berikutnya",
    otLabel: "Perpanjangan",
  },
  soccer: {
    label: "Sepak bola",
    periods: ["Babak 1", "Babak 2"],
    periodSeconds: 45 * 60,
    otSeconds: 15 * 60,
    points: [1],
    fouls: true,
    scoreWord: "Gol",
    nextLabel: "Babak berikutnya",
    otLabel: "Perpanjangan",
  },
  basket: {
    label: "Basket",
    periods: ["Kuarter 1", "Kuarter 2", "Kuarter 3", "Kuarter 4"],
    periodSeconds: 10 * 60,
    otSeconds: 5 * 60,
    points: [1, 2, 3],
    fouls: true,
    bonus: 5,
    nextLabel: "Kuarter berikutnya",
    otLabel: "Perpanjangan",
  },
  badminton: {
    label: "Bulu tangkis",
    points: [1],
    fouls: false,
    scoreWord: "Poin",
    target: 21,
    cap: 30,
    setsToWin: 2,
  },
};

const COLORS = ["#f2c14e", "#ff2b2b", "#3ddc84", "#7eb6ff", "#f4f1ea"];

const teamsEl = document.getElementById("teams");
const banner = document.getElementById("banner");
const logEl = document.getElementById("log");
const confirmDialog = document.getElementById("confirm");

const state = load();
let timer = null;
let lastTick = 0;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved?.matches && saved.sport && RULES[saved.sport]) {
      for (const sport of Object.keys(RULES)) {
        if (!saved.matches[sport]) saved.matches[sport] = blank(sport);
      }
      saved.matches[saved.sport].running = false;
      return saved;
    }
  } catch {
    /* simpanan rusak diabaikan */
  }
  return {
    sport: "futsal",
    matches: {
      futsal: blank("futsal"),
      soccer: blank("soccer"),
      basket: blank("basket"),
      badminton: blank("badminton"),
    },
  };
}

function blank(sport) {
  const rules = RULES[sport];
  return {
    home: { name: "Tuan rumah", score: 0, fouls: 0, sets: 0, color: COLORS[0] },
    away: { name: "Tamu", score: 0, fouls: 0, sets: 0, color: COLORS[3] },
    period: 0,
    ot: 0,
    clockMs: (rules.periodSeconds || 0) * 1000,
    running: false,
    played: [],
    history: [],
  };
}

function match() {
  return state.matches[state.sport];
}

function rules() {
  return RULES[state.sport];
}

function save() {
  match().running = false;
  localStorage.setItem(KEY, JSON.stringify(state));
  match().running = timer !== null;
}

function periodLabel() {
  const game = match();
  const spec = rules();
  if (!spec.periods) return game.home.sets + game.away.sets === 0 ? "Set 1" : `Set ${game.played.length + 1}`;
  if (game.ot > 0) return game.ot === 1 ? "Perpanjangan" : `Perpanjangan ${game.ot}`;
  return spec.periods[game.period];
}

function clockText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setWon(score, other) {
  const spec = rules();
  if (score >= spec.cap) return true;
  return score >= spec.target && score - other >= 2;
}

function matchWon() {
  const spec = rules();
  const game = match();
  if (!spec.setsToWin) return false;
  return game.home.sets >= spec.setsToWin || game.away.sets >= spec.setsToWin;
}

function setClosed() {
  const game = match();
  if (!rules().setsToWin || matchWon()) return false;
  return setWon(game.home.score, game.away.score) || setWon(game.away.score, game.home.score);
}

function pushHistory(entry) {
  match().history.push(entry);
  if (match().history.length > 16) match().history.shift();
}

function addPoints(side, amount) {
  const game = match();
  if (amount > 0 && (setClosed() || matchWon())) return;
  const team = game[side];
  const before = team.score;
  team.score = Math.max(0, team.score + amount);
  if (team.score === before) return;
  const verb = amount < 0 ? "Koreksi" : rules().scoreWord || `+${amount}`;
  pushHistory({ kind: "score", side, before, label: `${verb} ${game.home.score}–${game.away.score}` });
  render();
}

function changeFoul(side, delta) {
  const team = match()[side];
  const before = team.fouls;
  team.fouls = Math.max(0, team.fouls + delta);
  if (team.fouls === before) return;
  pushHistory({ kind: "foul", side, before, label: `Pelanggaran · ${team.name}` });
  render();
}

function nextPeriod() {
  const spec = rules();
  const game = match();
  const snapshot = {
    period: game.period,
    ot: game.ot,
    clockMs: game.clockMs,
    homeFouls: game.home.fouls,
    awayFouls: game.away.fouls,
    running: game.running,
  };
  stopClock();
  if (game.ot === 0 && game.period < spec.periods.length - 1) game.period += 1;
  else game.ot += 1;
  game.home.fouls = 0;
  game.away.fouls = 0;
  game.clockMs = (game.ot > 0 ? spec.otSeconds : spec.periodSeconds) * 1000;
  pushHistory({ kind: "period", ...snapshot, label: periodLabel() });
  render();
}

function closeSet() {
  const game = match();
  const snapshot = {
    home: game.home.score,
    away: game.away.score,
    homeSets: game.home.sets,
    awaySets: game.away.sets,
    played: game.played.slice(),
  };
  if (game.home.score > game.away.score) game.home.sets += 1;
  else game.away.sets += 1;
  game.played.push({ home: game.home.score, away: game.away.score });
  game.home.score = 0;
  game.away.score = 0;
  pushHistory({ kind: "set", ...snapshot, label: `Set ${game.played.length} selesai` });
  render();
}

function undo() {
  const entry = match().history.pop();
  if (!entry) return;
  const game = match();
  stopClock();
  if (entry.kind === "score") game[entry.side].score = entry.before;
  if (entry.kind === "foul") game[entry.side].fouls = entry.before;
  if (entry.kind === "period") {
    game.period = entry.period;
    game.ot = entry.ot;
    game.clockMs = entry.clockMs;
    game.home.fouls = entry.homeFouls;
    game.away.fouls = entry.awayFouls;
  }
  if (entry.kind === "set") {
    game.home.score = entry.home;
    game.away.score = entry.away;
    game.home.sets = entry.homeSets;
    game.away.sets = entry.awaySets;
    game.played = entry.played;
  }
  if (entry.kind === "swap") {
    game.home = entry.home;
    game.away = entry.away;
    game.played = entry.played;
  }
  render();
}

function swapSides() {
  const game = match();
  const snapshot = {
    home: { ...game.home },
    away: { ...game.away },
    played: game.played.map((set) => ({ ...set })),
  };
  const home = game.home;
  game.home = game.away;
  game.away = home;
  game.played = game.played.map((set) => ({ home: set.away, away: set.home }));
  pushHistory({ kind: "swap", ...snapshot, label: "Tukar sisi" });
  render();
}

function resetMatch() {
  stopClock();
  state.matches[state.sport] = blank(state.sport);
  render();
}

function startClock() {
  const game = match();
  if (!rules().periodSeconds || game.clockMs <= 0) return;
  if (game.running) {
    stopClock();
    renderClock();
    return;
  }
  game.running = true;
  lastTick = performance.now();
  timer = window.setInterval(tick, 200);
  renderClock();
}

function stopClock() {
  match().running = false;
  if (timer) window.clearInterval(timer);
  timer = null;
  save();
}

function tick() {
  const game = match();
  const now = performance.now();
  game.clockMs = Math.max(0, game.clockMs - (now - lastTick));
  lastTick = now;
  if (game.clockMs <= 0) {
    stopClock();
    showBanner("Waktu habis");
    render();
    return;
  }
  renderClock();
}

function showBanner(text) {
  banner.hidden = !text;
  banner.textContent = text || "";
}

function renderClock() {
  const clock = document.getElementById("clock");
  const toggle = document.getElementById("toggle-clock");
  if (!clock) return;
  clock.textContent = clockText(match().clockMs);
  clock.classList.toggle("is-running", match().running);
  if (toggle) toggle.textContent = match().running ? "Jeda" : "Mulai";
}

function teamCard(side) {
  const spec = rules();
  const game = match();
  const team = game[side];
  const rival = game[side === "home" ? "away" : "home"];
  const locked = setClosed() || matchWon();
  const leading = team.score > rival.score || team.sets > rival.sets;
  const buttons = spec.points.map((point) => {
    const label = spec.points.length === 1 ? "+1" : `+${point}`;
    return `<button type="button" class="add" data-act="score" data-side="${side}" data-n="${point}" ${locked ? "disabled" : ""}>${label}</button>`;
  }).join("");
  const fouls = spec.fouls ? `
    <div class="foul-row">
      <button type="button" class="foul-btn" data-act="foul" data-side="${side}" data-n="-1" aria-label="Kurangi pelanggaran">−</button>
      <span class="foul-label">Pelanggaran ${team.fouls}</span>
      ${team.fouls >= spec.bonus ? `<span class="bonus">${state.sport === "basket" ? "Bonus" : "Batas"}</span>` : ""}
      <button type="button" class="foul-btn" data-act="foul" data-side="${side}" data-n="1" aria-label="Tambah pelanggaran">+</button>
    </div>` : `<p class="sets-line">Menang ${team.sets} set</p>`;
  const swatches = COLORS.map((color) => `
    <button type="button" class="swatch" style="--swatch:${color}" data-act="color" data-side="${side}" data-color="${color}" aria-label="Warna ${color}" aria-pressed="${team.color === color}"></button>
  `).join("");
  return `
    <article class="team${leading ? " is-lead" : ""}" style="--team:${team.color}">
      <input class="name" data-side="${side}" value="${escapeAttr(team.name)}" maxlength="22" aria-label="Nama ${side === "home" ? "kiri" : "kanan"}">
      <div class="swatches">${swatches}</div>
      <p class="score">${team.score}</p>
      <div class="score-actions">
        ${buttons}
        <button type="button" class="minus" data-act="score" data-side="${side}" data-n="-1" ${team.score === 0 ? "disabled" : ""}>−</button>
      </div>
      ${fouls}
    </article>`;
}

function centerCard() {
  const spec = rules();
  const game = match();
  if (spec.setsToWin) {
    const sets = game.played.map((set) => `${set.home}–${set.away}`).join("  ·  ");
    const status = matchWon()
      ? `${game.home.sets > game.away.sets ? game.home.name : game.away.name} menang`
      : setClosed()
        ? "Set selesai"
        : "Sampai 21, unggul 2";
    return `
      <div class="center">
        <p class="period">${periodLabel()}</p>
        <p class="clock">${game.home.sets}–${game.away.sets}</p>
        <p class="sets-line">${status}</p>
        ${sets ? `<p class="sets-line">${sets}</p>` : ""}
        <div class="clock-actions">
          <button type="button" class="primary" id="close-set" ${setClosed() && !matchWon() ? "" : "disabled"}>Set berikutnya</button>
        </div>
      </div>`;
  }
  const inRegulation = game.ot === 0 && game.period < spec.periods.length - 1;
  return `
    <div class="center">
      <p class="period">${periodLabel()}</p>
      <p class="clock${game.running ? " is-running" : ""}" id="clock">${clockText(game.clockMs)}</p>
      <div class="clock-actions">
        <button type="button" class="primary" id="toggle-clock">${game.running ? "Jeda" : "Mulai"}</button>
        <button type="button" id="next-period">${inRegulation ? spec.nextLabel : spec.otLabel}</button>
      </div>
    </div>`;
}

function render() {
  document.body.dataset.sport = state.sport;
  document.querySelectorAll(".sport").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.sport === state.sport));
  });
  teamsEl.innerHTML = `${teamCard("home")}${centerCard()}${teamCard("away")}`;
  const game = match();
  const items = game.history.slice(-4).reverse();
  logEl.innerHTML = items.map((entry) => `<li>${escapeHtml(entry.label)}</li>`).join("") || "<li>Belum ada catatan</li>";
  document.getElementById("undo").disabled = game.history.length === 0;

  let message = "";
  if (matchWon()) {
    const winner = game.home.sets > game.away.sets ? game.home.name : game.away.name;
    message = `${winner} memenangkan pertandingan.`;
  } else if (setClosed()) {
    const winner = game.home.score > game.away.score ? game.home.name : game.away.name;
    message = `${winner} memenangkan set ini. Lanjut ke set berikutnya.`;
  } else if (rules().periodSeconds && game.clockMs <= 0) {
    message = "Waktu habis.";
  }
  showBanner(message);

  const left = game.home.score;
  const right = game.away.score;
  document.title = `${left}–${right} · ${rules().label} — Arena`;
  save();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

document.querySelector(".sports").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sport]");
  if (!button || button.dataset.sport === state.sport) return;
  stopClock();
  state.sport = button.dataset.sport;
  render();
});

teamsEl.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { act, side, n, color } = button.dataset;
  if (act === "score") addPoints(side, Number(n));
  if (act === "foul") changeFoul(side, Number(n));
  if (act === "color") {
    match()[side].color = color;
    render();
  }
  if (button.id === "toggle-clock") startClock();
  if (button.id === "next-period") nextPeriod();
  if (button.id === "close-set") closeSet();
});

teamsEl.addEventListener("input", (event) => {
  const field = event.target;
  if (!field.classList.contains("name")) return;
  match()[field.dataset.side].name = field.value;
  save();
});

document.getElementById("undo").addEventListener("click", undo);
document.getElementById("swap").addEventListener("click", swapSides);
document.getElementById("reset").addEventListener("click", () => confirmDialog.showModal());
confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue === "ok") resetMatch();
});

render();
