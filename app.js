'use strict';

// ---------- 저장소 ----------
const STORAGE_KEY = 'word-book:v1';
const DAY = 24 * 60 * 60 * 1000;
// 라이트너 상자별 복습 간격(일). 맞히면 다음 상자로, 틀리면 0번 상자로.
const INTERVALS = [0, 1, 2, 4, 7, 15];
const MASTERED_BOX = 4;

const SAMPLE_WORDS = [
  ['abandon', '버리다, 포기하다', 'They had to abandon the car.'],
  ['achieve', '성취하다', 'She achieved her goal.'],
  ['brief', '짧은, 간단한', 'He gave a brief speech.'],
  ['consider', '고려하다', 'Please consider my offer.'],
  ['curious', '호기심이 많은', 'Children are naturally curious.'],
  ['decline', '거절하다, 감소하다', 'Sales declined last year.'],
  ['efficient', '효율적인', 'This is an efficient method.'],
  ['essential', '필수적인', 'Water is essential for life.'],
  ['improve', '개선하다', 'I want to improve my English.'],
  ['opportunity', '기회', 'This is a great opportunity.'],
  ['previous', '이전의', 'I met him on a previous visit.'],
  ['reliable', '믿을 수 있는', 'He is a reliable friend.'],
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function makeWord(word, meaning, example = '') {
  return {
    id: uid(), word: word.trim(), meaning: meaning.trim(), example: example.trim(),
    box: 0, due: Date.now(), correct: 0, wrong: 0, starred: false, createdAt: Date.now(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 저장소 사용 불가 시 샘플로 시작 */ }
  return { words: SAMPLE_WORDS.map(w => makeWord(...w)), history: {} };
}

const state = load();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('저장에 실패했습니다'); }
}

// ---------- 유틸 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const isDue = w => w.due <= Date.now();
const isMastered = w => w.box >= MASTERED_BOX;
const todayKey = () => new Date().toISOString().slice(0, 10);

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('이 브라우저는 발음 듣기를 지원하지 않아요');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// 학습 결과 기록 (라이트너 상자 이동 + 일별 기록)
function record(word, ok) {
  if (ok) {
    word.correct++;
    word.box = Math.min(word.box + 1, INTERVALS.length - 1);
  } else {
    word.wrong++;
    word.box = 0;
  }
  word.due = Date.now() + INTERVALS[word.box] * DAY;
  const day = state.history[todayKey()] ||= { correct: 0, wrong: 0 };
  ok ? day.correct++ : day.wrong++;
  save();
}

// ---------- 탭 ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

function showView(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'list') renderList();
  if (name === 'stats') renderStats();
  if (name === 'cards' && !cardSession) renderCardIntro();
  if (name === 'quiz' && !quizSession) renderQuizIntro();
}

// ---------- 단어장 ----------
const form = $('#word-form');

form.addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (data.wid) {
    const w = state.words.find(x => x.id === data.wid);
    if (w) Object.assign(w, { word: data.word.trim(), meaning: data.meaning.trim(), example: data.example.trim() });
    toast('수정했어요');
  } else {
    const dup = state.words.find(x => x.word.toLowerCase() === data.word.trim().toLowerCase());
    if (dup && !confirm(`"${dup.word}"는 이미 있어요. 그래도 추가할까요?`)) return;
    state.words.unshift(makeWord(data.word, data.meaning, data.example));
    toast('추가했어요');
  }
  save();
  resetForm();
  renderList();
  form.word.focus();
});

$('#form-cancel').addEventListener('click', resetForm);

function resetForm() {
  form.reset();
  form.wid.value = '';
  $('#form-submit').textContent = '추가';
  $('#form-cancel').classList.add('hidden');
}

function editWord(id) {
  const w = state.words.find(x => x.id === id);
  if (!w) return;
  form.wid.value = w.id;
  form.word.value = w.word;
  form.meaning.value = w.meaning;
  form.example.value = w.example;
  $('#form-submit').textContent = '수정';
  $('#form-cancel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  form.word.focus();
}

$('#search').addEventListener('input', renderList);
$('#filter').addEventListener('change', renderList);

function levelLabel(w) {
  if (isMastered(w)) return '<span class="level mastered">외움</span>';
  if (w.correct + w.wrong === 0) return '<span class="level">새 단어</span>';
  return `<span class="level">Lv.${w.box}</span>`;
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const filter = $('#filter').value;
  const list = state.words.filter(w => {
    if (q && !w.word.toLowerCase().includes(q) && !w.meaning.toLowerCase().includes(q)) return false;
    if (filter === 'due') return isDue(w);
    if (filter === 'learning') return !isMastered(w);
    if (filter === 'mastered') return isMastered(w);
    if (filter === 'starred') return w.starred;
    return true;
  });

  $('#list-count').textContent = `${list.length}개 / 전체 ${state.words.length}개`;
  const ul = $('#word-list');
  if (!list.length) {
    ul.innerHTML = `<li class="empty">${state.words.length ? '조건에 맞는 단어가 없어요.' : '단어를 추가해 보세요!'}</li>`;
    return;
  }
  ul.innerHTML = list.map(w => `
    <li class="word-item" data-id="${w.id}">
      <button class="icon-btn ${w.starred ? 'starred' : ''}" data-act="star" title="중요 표시">${w.starred ? '★' : '☆'}</button>
      <div class="body">
        <div class="en">${esc(w.word)}</div>
        <div class="ko">${esc(w.meaning)}</div>
        ${w.example ? `<div class="ex">${esc(w.example)}</div>` : ''}
      </div>
      ${levelLabel(w)}
      <button class="icon-btn" data-act="speak" title="발음 듣기">🔊</button>
      <button class="icon-btn" data-act="edit" title="수정">✏️</button>
      <button class="icon-btn" data-act="delete" title="삭제">🗑️</button>
    </li>`).join('');
}

$('#word-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.word-item').dataset.id;
  const w = state.words.find(x => x.id === id);
  if (!w) return;
  switch (btn.dataset.act) {
    case 'star': w.starred = !w.starred; save(); renderList(); break;
    case 'speak': speak(w.word); break;
    case 'edit': editWord(id); break;
    case 'delete':
      if (confirm(`"${w.word}"를 삭제할까요?`)) {
        state.words = state.words.filter(x => x.id !== id);
        save(); renderList();
      }
      break;
  }
});

// 가져오기 / 내보내기
$('#import-btn').addEventListener('click', () => {
  const lines = $('#import-text').value.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0;
  for (const line of lines) {
    const [word, meaning, ...rest] = line.split(/\t|,/).map(s => s.trim());
    if (!word || !meaning) continue;
    state.words.unshift(makeWord(word, meaning, rest.join(', ')));
    added++;
  }
  save();
  $('#import-text').value = '';
  renderList();
  toast(added ? `${added}개 단어를 가져왔어요` : '가져올 단어가 없어요');
});

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `word-book-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.words)) throw new Error('invalid');
    if (!confirm(`${data.words.length}개 단어로 현재 단어장을 바꿀까요?`)) return;
    state.words = data.words;
    state.history = data.history || {};
    save(); renderList();
    toast('불러왔어요');
  } catch {
    toast('올바른 JSON 파일이 아니에요');
  } finally {
    e.target.value = '';
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('모든 단어와 학습 기록을 삭제할까요?')) return;
  state.words = [];
  state.history = {};
  save(); renderList();
});

// ---------- 플래시카드 ----------
let cardSession = null;

function pickWords(mode) {
  if (mode === 'due') return state.words.filter(isDue);
  if (mode === 'starred') return state.words.filter(w => w.starred);
  return [...state.words];
}

function renderCardIntro() {
  const due = state.words.filter(isDue).length;
  $('#card-area').innerHTML = `
    <div class="card empty">
      오늘 복습할 단어: <strong>${due}개</strong><br>
      카드를 눌러 뒤집고, 알았는지 체크하세요. (단축키: Space 뒤집기, ← 몰라요, → 알아요)
    </div>`;
}

$('#card-start').addEventListener('click', () => {
  const words = shuffle(pickWords($('#card-mode').value));
  if (!words.length) {
    cardSession = null;
    $('#card-area').innerHTML = '<div class="card empty">학습할 단어가 없어요. 🎉<br>다른 모드를 선택하거나 단어를 추가해 보세요.</div>';
    return;
  }
  cardSession = { words, index: 0, known: 0, dir: $('#card-dir').value, flipped: false };
  renderCard();
});

function renderCard() {
  const s = cardSession;
  if (s.index >= s.words.length) {
    $('#card-area').innerHTML = `
      <div class="card result">
        <p>학습 완료!</p>
        <div class="score">${s.known} / ${s.words.length}</div>
        <p class="muted">모르는 단어는 내일 다시 나와요.</p>
      </div>`;
    cardSession = null;
    return;
  }
  const w = s.words[s.index];
  const front = s.dir === 'en' ? w.word : w.meaning;
  const back = s.dir === 'en' ? w.meaning : w.word;
  s.flipped = false;
  $('#card-area').innerHTML = `
    <div class="progress"><div style="width:${(s.index / s.words.length) * 100}%"></div></div>
    <p class="muted">${s.index + 1} / ${s.words.length}</p>
    <div class="flashcard" id="flashcard">
      <div class="flashcard-inner">
        <div class="face front">
          <div class="big">${esc(front)}</div>
          <div class="hint">눌러서 뒤집기</div>
        </div>
        <div class="face back">
          <div class="big">${esc(back)}</div>
          ${w.example ? `<div class="muted"><em>${esc(w.example)}</em></div>` : ''}
        </div>
      </div>
    </div>
    <div class="grade">
      <button class="no" data-grade="0">😕 몰라요</button>
      <button class="yes" data-grade="1">😀 알아요</button>
    </div>
    <div class="next-row"><button class="ghost" id="card-speak">🔊 발음 듣기</button></div>`;
  $('#flashcard').addEventListener('click', flipCard);
  $('#card-speak').addEventListener('click', () => speak(w.word));
  document.querySelectorAll('[data-grade]').forEach(b =>
    b.addEventListener('click', () => gradeCard(b.dataset.grade === '1')));
  if (s.dir === 'en') speak(w.word);
}

function flipCard() {
  if (!cardSession) return;
  cardSession.flipped = !cardSession.flipped;
  $('#flashcard').classList.toggle('flipped', cardSession.flipped);
}

function gradeCard(ok) {
  const s = cardSession;
  if (!s) return;
  record(s.words[s.index], ok);
  if (ok) s.known++;
  s.index++;
  renderCard();
}

document.addEventListener('keydown', e => {
  if (!$('#view-cards').classList.contains('active') || !cardSession) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (e.key === 'ArrowLeft') gradeCard(false);
  if (e.key === 'ArrowRight') gradeCard(true);
});

// ---------- 퀴즈 ----------
let quizSession = null;

function renderQuizIntro() {
  $('#quiz-area').innerHTML = `<div class="card empty">퀴즈 유형을 고르고 시작을 누르세요.<br>복습 시기가 된 단어와 자주 틀린 단어가 먼저 나와요.</div>`;
}

$('#quiz-start').addEventListener('click', () => {
  const type = $('#quiz-type').value;
  if (type.startsWith('choice') && state.words.length < 4) {
    $('#quiz-area').innerHTML = '<div class="card empty">객관식 퀴즈는 단어가 4개 이상 필요해요.</div>';
    return;
  }
  if (!state.words.length) {
    $('#quiz-area').innerHTML = '<div class="card empty">단어를 먼저 추가해 주세요.</div>';
    return;
  }
  // 복습할 단어 → 오답률 높은 단어 순으로 우선 출제
  const priority = w => (isDue(w) ? 0 : 1) * 1000 - (w.wrong - w.correct) - Math.random();
  const ordered = shuffle(state.words).sort((a, b) => priority(a) - priority(b));
  const count = Number($('#quiz-count').value) || ordered.length;
  quizSession = { type, words: shuffle(ordered.slice(0, count)), index: 0, score: 0, wrongs: [], answered: false };
  renderQuestion();
});

function renderQuestion() {
  const s = quizSession;
  if (s.index >= s.words.length) return renderQuizResult();
  s.answered = false;
  const w = s.words[s.index];
  const header = `
    <div class="progress"><div style="width:${(s.index / s.words.length) * 100}%"></div></div>
    <p class="muted">${s.index + 1} / ${s.words.length} · 점수 ${s.score}</p>`;

  if (s.type === 'typing') {
    $('#quiz-area').innerHTML = `${header}
      <div class="card">
        <div class="question">${esc(w.meaning)}</div>
        <p class="question-sub muted">영어 단어를 입력하세요 (첫 글자: ${esc(w.word[0])})</p>
        <form class="typing" id="typing-form">
          <input id="typing-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="정답 입력">
          <button class="primary">확인</button>
        </form>
        <div id="quiz-feedback"></div>
      </div>`;
    const input = $('#typing-input');
    input.focus();
    $('#typing-form').addEventListener('submit', e => {
      e.preventDefault();
      if (s.answered) return nextQuestion();
      const ok = input.value.trim().toLowerCase() === w.word.toLowerCase();
      answer(ok);
      input.disabled = true;
    });
    return;
  }

  const rev = s.type === 'choice-rev';
  const others = shuffle(state.words.filter(x => x.id !== w.id &&
    (rev ? x.word.toLowerCase() !== w.word.toLowerCase() : x.meaning !== w.meaning))).slice(0, 3);
  const options = shuffle([w, ...others]);
  $('#quiz-area').innerHTML = `${header}
    <div class="card">
      <div class="question">${esc(rev ? w.meaning : w.word)}</div>
      <p class="question-sub">${rev ? '' : '<button class="ghost" id="q-speak">🔊</button>'}</p>
      <div class="choices">
        ${options.map((o, i) => `<button data-id="${o.id}">${i + 1}. ${esc(rev ? o.word : o.meaning)}</button>`).join('')}
      </div>
      <div id="quiz-feedback"></div>
    </div>`;
  if (!rev) {
    $('#q-speak').addEventListener('click', () => speak(w.word));
    speak(w.word);
  }
  document.querySelectorAll('.choices button').forEach(btn => btn.addEventListener('click', () => {
    if (s.answered) return;
    const ok = btn.dataset.id === w.id;
    document.querySelectorAll('.choices button').forEach(b => {
      if (b.dataset.id === w.id) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
      b.disabled = true;
    });
    answer(ok);
  }));
}

function answer(ok) {
  const s = quizSession;
  const w = s.words[s.index];
  s.answered = true;
  record(w, ok);
  if (ok) s.score++;
  else s.wrongs.push(w);
  $('#quiz-feedback').innerHTML = `
    <div class="feedback ${ok ? 'correct' : 'wrong'}">
      ${ok ? '정답! 👍' : '오답 😢'} — <strong>${esc(w.word)}</strong>: ${esc(w.meaning)}
      ${w.example ? `<div class="muted"><em>${esc(w.example)}</em></div>` : ''}
    </div>
    <div class="next-row"><button class="primary" id="next-q">다음 (Enter)</button></div>`;
  $('#next-q').addEventListener('click', nextQuestion);
  $('#next-q').focus();
}

function nextQuestion() {
  quizSession.index++;
  renderQuestion();
}

document.addEventListener('keydown', e => {
  const s = quizSession;
  if (!$('#view-quiz').classList.contains('active') || !s || s.type === 'typing') return;
  if (!s.answered && /^[1-4]$/.test(e.key)) {
    document.querySelectorAll('.choices button')[Number(e.key) - 1]?.click();
  }
});

function renderQuizResult() {
  const s = quizSession;
  const pct = Math.round((s.score / s.words.length) * 100);
  $('#quiz-area').innerHTML = `
    <div class="card result">
      <p>퀴즈 완료!</p>
      <div class="score">${pct}점</div>
      <p class="muted">${s.words.length}문제 중 ${s.score}개 정답</p>
      ${s.wrongs.length ? `
        <div class="wrong-list">
          <h3>틀린 단어</h3>
          <ul>${s.wrongs.map(w => `<li><strong>${esc(w.word)}</strong> — ${esc(w.meaning)}</li>`).join('')}</ul>
        </div>` : '<p>모두 맞혔어요! 🎉</p>'}
    </div>`;
  quizSession = null;
}

// ---------- 통계 ----------
function renderStats() {
  const total = state.words.length;
  const mastered = state.words.filter(isMastered).length;
  const due = state.words.filter(isDue).length;
  const correct = state.words.reduce((n, w) => n + w.correct, 0);
  const wrong = state.words.reduce((n, w) => n + w.wrong, 0);
  const acc = correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0;

  // 최근 7일 학습량
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY).toISOString().slice(0, 10);
    const h = state.history[d] || { correct: 0, wrong: 0 };
    return { d: d.slice(5), n: h.correct + h.wrong };
  });
  const maxDay = Math.max(1, ...days.map(d => d.n));

  // 상자별 분포
  const boxes = INTERVALS.map((_, i) => state.words.filter(w => w.box === i).length);
  const maxBox = Math.max(1, ...boxes);

  const hardest = [...state.words].filter(w => w.wrong > 0)
    .sort((a, b) => (b.wrong - b.correct) - (a.wrong - a.correct)).slice(0, 5);

  $('#stats-area').innerHTML = `
    <div class="stat-grid">
      <div class="card stat"><div class="num">${total}</div><div class="muted">전체 단어</div></div>
      <div class="card stat"><div class="num">${mastered}</div><div class="muted">외운 단어</div></div>
      <div class="card stat"><div class="num">${due}</div><div class="muted">오늘 복습</div></div>
      <div class="card stat"><div class="num">${acc}%</div><div class="muted">정답률</div></div>
    </div>
    <div class="card">
      <h3>최근 7일 학습량</h3>
      <div class="bars">${days.map(d => `
        <div class="bar-row"><span>${d.d}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(d.n / maxDay) * 100}%"></div></div>
          <span>${d.n}</span></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>암기 단계</h3>
      <div class="bars">${boxes.map((n, i) => `
        <div class="bar-row"><span>${i === 0 ? '새/오답' : 'Lv.' + i}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(n / maxBox) * 100}%"></div></div>
          <span>${n}</span></div>`).join('')}
      </div>
      <p class="muted">맞힐수록 단계가 올라가고 복습 간격이 길어져요 (Lv.${MASTERED_BOX} 이상 = 외운 단어).</p>
    </div>
    ${hardest.length ? `
    <div class="card">
      <h3>자주 틀리는 단어</h3>
      <ul>${hardest.map(w => `<li><strong>${esc(w.word)}</strong> — ${esc(w.meaning)} <span class="muted">(오답 ${w.wrong}회)</span></li>`).join('')}</ul>
    </div>` : ''}`;
}

// ---------- 시작 ----------
save();
renderList();
