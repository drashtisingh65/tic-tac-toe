/* ============================================================================
   TIC-TAC-TOE AI — script.js
   An unbeatable AI opponent built with the Minimax algorithm (+ alpha-beta
   pruning). Read the comments around `minimax()` for a full walkthrough.
   ============================================================================ */

/* ----------------------------------------------------------------------------
   1. CONSTANTS & STATE
   -------------------------------------------------------------------------- */

const HUMAN = "X";
const AI = "O";
const EMPTY = "";

// All 8 possible winning combinations (rows, columns, diagonals) as cell indexes.
const WIN_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],           // diagonals
];

// Core mutable game state.
let board = Array(9).fill(EMPTY);   // the 9 cells, "" | "X" | "O"
let gameActive = false;             // true while moves are allowed
let humanStarts = true;             // who moves first this game
let currentTurn = HUMAN;            // whose turn it currently is
let scores = { human: 0, ai: 0, draw: 0 };

/* ----------------------------------------------------------------------------
   2. DOM REFERENCES
   -------------------------------------------------------------------------- */

const boardEl = document.getElementById("board");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const winLineSvg = document.getElementById("winLineSvg");
const winLine = document.getElementById("winLine");

const restartBtn = document.getElementById("restartBtn");
const newGameBtn = document.getElementById("newGameBtn");
const firstHumanBtn = document.getElementById("firstHumanBtn");
const firstAiBtn = document.getElementById("firstAiBtn");
const soundToggle = document.getElementById("soundToggle");

const scoreHumanEl = document.getElementById("scoreHuman");
const scoreAiEl = document.getElementById("scoreAi");
const scoreDrawEl = document.getElementById("scoreDraw");

/* ----------------------------------------------------------------------------
   3. SOUND EFFECTS (generated with the Web Audio API — no external files)
   -------------------------------------------------------------------------- */

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Plays a short synthesized beep.
 * @param {number} freq - frequency in Hz
 * @param {number} duration - length in seconds
 * @param {string} type - oscillator waveform
 */
function playTone(freq, duration = 0.12, type = "sine") {
  if (!soundToggle.checked) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    /* Audio not available — fail silently */
  }
}

const sounds = {
  human: () => playTone(520, 0.1, "triangle"),
  ai: () => playTone(340, 0.12, "sine"),
  win: () => { playTone(660, 0.12); setTimeout(() => playTone(880, 0.18), 120); },
  lose: () => { playTone(220, 0.18, "sawtooth"); setTimeout(() => playTone(160, 0.22, "sawtooth"), 140); },
  draw: () => playTone(300, 0.25, "square"),
};

/* ----------------------------------------------------------------------------
   4. BOARD RENDERING
   -------------------------------------------------------------------------- */

/** Builds the 9 cell buttons once on page load. */
function buildBoardDOM() {
  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.dataset.index = i;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Cell ${i + 1}`);
    cell.addEventListener("click", () => onCellClick(i));
    boardEl.appendChild(cell);
  }
}

/** Returns the SVG markup for an X or O mark. */
function markSVG(player) {
  if (player === HUMAN) {
    return `<svg viewBox="0 0 100 100" fill="none">
      <path class="mark-path" d="M20 20 L80 80" stroke="var(--human)" stroke-width="10" stroke-linecap="round"/>
      <path class="mark-path" d="M80 20 L20 80" stroke="var(--human)" stroke-width="10" stroke-linecap="round" style="animation-delay:0.06s"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 100 100" fill="none">
    <circle class="mark-path" cx="50" cy="50" r="32" stroke="var(--ai)" stroke-width="10" stroke-dasharray="201" stroke-dashoffset="201"/>
  </svg>`;
}

/** Re-renders all cells based on the `board` array. */
function renderBoard() {
  const cells = boardEl.children;
  for (let i = 0; i < 9; i++) {
    const cell = cells[i];
    const value = board[i];
    cell.classList.toggle("filled", value !== EMPTY);
    cell.classList.remove("win-cell");
    cell.innerHTML = value ? markSVG(value) : "";
  }
  // Reset any previous winning line.
  winLine.classList.remove("draw");
  winLine.setAttribute("x1", 0);
  winLine.setAttribute("y1", 0);
  winLine.setAttribute("x2", 0);
  winLine.setAttribute("y2", 0);
}

/** Enables/disables clicking based on whether the game is active. */
function setBoardInteractive(interactive) {
  const cells = boardEl.children;
  for (let i = 0; i < 9; i++) {
    cells[i].classList.toggle("disabled", !interactive);
  }
}

/* ----------------------------------------------------------------------------
   5. STATUS / UI HELPERS
   -------------------------------------------------------------------------- */

function setStatus(message, dotState) {
  statusText.textContent = message;
  statusDot.className = "status-dot" + (dotState ? ` ${dotState}` : "");
}

function updateScoreboard() {
  scoreHumanEl.textContent = scores.human;
  scoreAiEl.textContent = scores.ai;
  scoreDrawEl.textContent = scores.draw;
}

function saveScores() {
  try {
    localStorage.setItem("ttt_ai_scores", JSON.stringify(scores));
  } catch (e) { /* localStorage unavailable — ignore */ }
}

function loadScores() {
  try {
    const saved = localStorage.getItem("ttt_ai_scores");
    if (saved) scores = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}

/* ----------------------------------------------------------------------------
   6. GAME LOGIC — win / draw detection
   -------------------------------------------------------------------------- */

/**
 * Checks a board array for a winner.
 * @param {Array<string>} b - board state to check
 * @returns {{winner: string, combo: number[]} | null}
 */
function checkWinner(b) {
  for (const combo of WIN_COMBOS) {
    const [a, c, d] = combo;
    if (b[a] !== EMPTY && b[a] === b[c] && b[a] === b[d]) {
      return { winner: b[a], combo };
    }
  }
  return null;
}

function isBoardFull(b) {
  return b.every((cell) => cell !== EMPTY);
}

/* ----------------------------------------------------------------------------
   7. THE MINIMAX AI  (the heart of the project)
   ----------------------------------------------------------------------------

   HOW IT WORKS
   ------------
   Minimax treats the game as a tree of possible futures:

     - The AI ("O") is the MAXIMIZING player — it tries to reach the
       highest possible score.
     - The human ("X") is the MINIMIZING player — Minimax assumes the
       human will always play their strongest possible move, so it plans
       for the worst case from the AI's perspective.

   The function plays out a hypothetical move, then RECURSIVELY calls
   itself for the opponent's best reply, and so on, until it reaches a
   terminal state (win, loss, or draw). Terminal states are scored:

       AI wins   -> +10 (minus depth, so faster wins are preferred)
       Human wins -> -10 (plus depth, so slower losses are preferred)
       Draw       ->  0

   Those scores bubble back up the tree: at each MAX level we keep the
   highest child score, at each MIN level we keep the lowest child
   score. The very first call therefore returns the score of the best
   move available *right now*, and by tracking which move produced that
   score we know exactly what the AI should play.

   ALPHA-BETA PRUNING
   -------------------
   Because Tic-Tac-Toe's tree is small, plain minimax is already instant.
   We still add alpha-beta pruning as good practice / optimization: it
   skips branches that can't possibly change the final decision, using
   two bounds:
     - alpha: the best score the MAXIMIZING player can already guarantee
     - beta:  the best score the MINIMIZING player can already guarantee
   If a branch's score falls outside the current [alpha, beta] window,
   the rest of that branch is skipped ("pruned") because a rational
   opponent would never let it happen.
   -------------------------------------------------------------------------- */

/**
 * Recursively scores a board state from the AI's perspective.
 * @param {Array<string>} b - current board state
 * @param {number} depth - how many moves deep we are (used to prefer quick wins)
 * @param {boolean} isMaximizing - true if it's the AI's (O's) turn to move
 * @param {number} alpha - best score MAX can currently guarantee
 * @param {number} beta - best score MIN can currently guarantee
 * @returns {number} the minimax score of this board state
 */
function minimax(b, depth, isMaximizing, alpha, beta) {
  const result = checkWinner(b);
  if (result) {
    if (result.winner === AI) return 10 - depth;      // AI win: prefer faster wins
    if (result.winner === HUMAN) return depth - 10;   // Human win: prefer slower losses
  }
  if (isBoardFull(b)) return 0; // draw

  if (isMaximizing) {
    // AI's turn — try every empty cell, keep the maximum score.
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = AI;
      const score = minimax(b, depth + 1, false, alpha, beta);
      b[i] = EMPTY; // undo the hypothetical move (backtracking)
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break; // beta cutoff — prune remaining branches
    }
    return best;
  } else {
    // Human's turn (simulated) — try every empty cell, keep the minimum score.
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = HUMAN;
      const score = minimax(b, depth + 1, true, alpha, beta);
      b[i] = EMPTY;
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break; // alpha cutoff — prune remaining branches
    }
    return best;
  }
}

/**
 * Determines the AI's optimal move for the current `board`.
 * Runs minimax once per available empty cell and keeps the best-scoring one.
 * @returns {number} index (0-8) of the chosen cell
 */
function getBestMove() {
  let bestScore = -Infinity;
  let bestMove = -1;

  // Opening-move shortcut: if the board is empty, taking the center is
  // provably optimal and saves us running the full tree unnecessarily.
  if (board.every((c) => c === EMPTY)) {
    return 4;
  }

  for (let i = 0; i < 9; i++) {
    if (board[i] !== EMPTY) continue;
    board[i] = AI;
    const score = minimax(board, 0, false, -Infinity, Infinity);
    board[i] = EMPTY;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

/* ----------------------------------------------------------------------------
   8. TURN FLOW
   -------------------------------------------------------------------------- */

function onCellClick(index) {
  if (!gameActive) return;
  if (currentTurn !== HUMAN) return;
  if (board[index] !== EMPTY) return;

  placeMark(index, HUMAN);
  sounds.human();

  const outcome = evaluateGameEnd();
  if (outcome) {
    finishGame(outcome);
    return;
  }

  currentTurn = AI;
  setStatus("AI Thinking...", "thinking");
  setBoardInteractive(false);

  // Small delay so the AI's move feels like deliberate "thinking".
  const thinkTime = 500 + Math.random() * 300; // 500–800ms
  setTimeout(() => {
    const aiMove = getBestMove();
    placeMark(aiMove, AI);
    sounds.ai();

    const aiOutcome = evaluateGameEnd();
    if (aiOutcome) {
      finishGame(aiOutcome);
      return;
    }

    currentTurn = HUMAN;
    setStatus("Your Turn", null);
    setBoardInteractive(true);
  }, thinkTime);
}

function placeMark(index, player) {
  board[index] = player;
  const cell = boardEl.children[index];
  cell.classList.add("filled");
  cell.innerHTML = markSVG(player);
}

/**
 * Checks whether the game has ended after the most recent move.
 * @returns {{type: "win"|"draw", winner?: string, combo?: number[]} | null}
 */
function evaluateGameEnd() {
  const result = checkWinner(board);
  if (result) return { type: "win", winner: result.winner, combo: result.combo };
  if (isBoardFull(board)) return { type: "draw" };
  return null;
}

function finishGame(outcome) {
  gameActive = false;
  setBoardInteractive(false);

  if (outcome.type === "win") {
    highlightWinningCombo(outcome.combo);
    if (outcome.winner === HUMAN) {
      setStatus("You Win!", "win");
      scores.human++;
      sounds.win();
    } else {
      setStatus("AI Wins!", "lose");
      scores.ai++;
      sounds.lose();
    }
  } else {
    setStatus("It's a Draw!", "draw");
    scores.draw++;
    sounds.draw();
  }

  updateScoreboard();
  saveScores();
}

/** Adds the highlight class to the 3 winning cells and draws the strike-through line. */
function highlightWinningCombo(combo) {
  combo.forEach((i) => boardEl.children[i].classList.add("win-cell"));
  drawWinLine(combo);
}

/** Positions and animates the SVG line across the 3 winning cells. */
function drawWinLine(combo) {
  // Centers of each cell in a 0-300 viewBox that matches win-line-svg's inset area.
  const centers = [
    [50, 50], [150, 50], [250, 50],
    [50, 150], [150, 150], [250, 150],
    [50, 250], [150, 250], [250, 250],
  ];
  const [start, , end] = [centers[combo[0]], centers[combo[1]], centers[combo[2]]];

  winLine.setAttribute("x1", start[0]);
  winLine.setAttribute("y1", start[1]);
  winLine.setAttribute("x2", end[0]);
  winLine.setAttribute("y2", end[1]);
  // Force reflow so the draw animation restarts cleanly each time.
  void winLine.getBoundingClientRect();
  winLine.classList.add("draw");
}

/* ----------------------------------------------------------------------------
   9. GAME / ROUND RESET CONTROLS
   -------------------------------------------------------------------------- */

/** Starts a fresh round, keeping the running scoreboard totals. */
function startRound() {
  board = Array(9).fill(EMPTY);
  gameActive = true;
  renderBoard();
  setBoardInteractive(true);

  currentTurn = humanStarts ? HUMAN : AI;

  if (currentTurn === HUMAN) {
    setStatus("Your Turn", null);
  } else {
    setStatus("AI Thinking...", "thinking");
    setBoardInteractive(false);
    setTimeout(() => {
      const aiMove = getBestMove();
      placeMark(aiMove, AI);
      sounds.ai();
      currentTurn = HUMAN;
      setStatus("Your Turn", null);
      setBoardInteractive(true);
    }, 500 + Math.random() * 300);
  }
}

/** Fully resets everything, including the scoreboard totals. */
function startNewGame() {
  scores = { human: 0, ai: 0, draw: 0 };
  updateScoreboard();
  saveScores();
  startRound();
}

/* ----------------------------------------------------------------------------
   10. EVENT WIRING
   -------------------------------------------------------------------------- */

restartBtn.addEventListener("click", startRound);
newGameBtn.addEventListener("click", startNewGame);

firstHumanBtn.addEventListener("click", () => {
  humanStarts = true;
  firstHumanBtn.classList.add("active");
  firstAiBtn.classList.remove("active");
  startRound();
});

firstAiBtn.addEventListener("click", () => {
  humanStarts = false;
  firstAiBtn.classList.add("active");
  firstHumanBtn.classList.remove("active");
  startRound();
});

/* ----------------------------------------------------------------------------
   11. INIT
   -------------------------------------------------------------------------- */

function init() {
  loadScores();
  updateScoreboard();
  buildBoardDOM();
  startRound();
}

init();
