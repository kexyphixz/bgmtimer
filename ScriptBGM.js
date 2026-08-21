// 異世界BGM25Timer - ScriptBGM.js
// =====================================================================
// ---- 時間帯の定義（他の多くの処理がこれを参照するので最初に置く） ----
const PHASES = ['morning', 'noon', 'night'];
const PHASE_BY_LABEL = { '朝': 'morning', '昼': 'noon', '夜': 'night' };
const LABEL_BY_PHASE = { morning: '朝', noon: '昼', night: '夜' };

// ---- 音楽データ（作業曲・休憩曲） ----
// v35: 中身は起動時 loadAllTracks() で埋まる（それまでは空配列）。
// list.txt は1行1ファイル名（そのフォルダ内の相対名、拡張子込み）。
const musicTracks = { morning: [], noon: [], night: [] };
const restTracks = { morning: [], noon: [], night: [] };

// 各時間帯・作業/休憩がどのフォルダに対応するか
const TRACK_FOLDERS = {
  morning: { work: 'morning', rest: 'morningrest' },
  noon:    { work: 'noon',    rest: 'noonrest' },
  night:   { work: 'night',   rest: 'nightrest' }
};

// 曲ごとのクレジット情報。キーは "フォルダ名/ファイル名" の形。
// 情報が無い曲は設定画面で「未設定」と表示されるだけで、再生には影響しない。
//
// 作者が少数なので、先に ARTISTS にまとめて各曲から参照する。
// URL を修正するときも1箇所で済み、曲が増えても作者情報は書き直さない。
const ARTISTS = {
  a: { artist: '南雲莉翠（なぐもりず）様', url: 'https://nagumorizu.com' },
  b: { artist: '音楽の卵 様', url: 'https://ontama-m.com/index.html' },
  c: { artist: '効果音ラボ 様', url: 'https://soundeffect-lab.info' },
  d: { artist: 'ポケットサウンド 様', url: 'https://pocket-se.info'}
};

const TRACK_CREDITS = {
  //朝　作業
  'morning/morning1.mp3': ARTISTS.a,
  'morning/morning2.mp3': ARTISTS.a,
  'morning/morning3.mp3': ARTISTS.a,
  'morning/morning4.mp3': ARTISTS.a,
  //朝　休憩
  'morningrest/Reposons-un-Peu.mp3': ARTISTS.a,
  'morningrest/涼風のシュトラールブルク.mp3': ARTISTS.a,
  //昼　作業
  'noon/今日から私はこの街の人.mp3':ARTISTS.b,
  'noon/僕らの街.mp3':ARTISTS.b,
  'noon/全体マップ.mp3':ARTISTS.b,
  'noon/晴天の資材集め.mp3':ARTISTS.b,
  //昼 休憩
  'noonrest/ゆっくり時間が流れる町.mp3': ARTISTS.b,
  'noonrest/道なりに.mp3': ARTISTS.b,
  //夜　作業
  'night/Orecchiette-alla-Pugliese.mp3':ARTISTS.a,
  'night/Triple-Sec.mp3':ARTISTS.a,
  'night/Cafe-et-Croissant.mp3':ARTISTS.a,
  'night/Casarecce-cacio-e-pepe.mp3':ARTISTS.a,
  //夜　休憩
  'nightrest/Midnight-Tea-Time.mp3':ARTISTS.a,
  'nightrest/Nuit-de-Strahlburg.mp3':ARTISTS.a,
  //自然音
  'sound/n1_river.mp3': ARTISTS.d,
  'sound/n2_waterfall.mp3': ARTISTS.c,
  'sound/n3_waves.mp3': ARTISTS.c,
  'sound/n4_campfire.mp3': ARTISTS.c,
  'sound/n5_insects.mp3': ARTISTS.c,
  'sound/n6_higurashi.mp3': ARTISTS.c,
  'sound/n7_windchime.mp3': ARTISTS.c,
  'sound/n8_rain.mp3': ARTISTS.c,
};

// folder/list.txt を読み込み、フォルダ名を先頭に付けたパスの配列を返す。
// 読み込めなかった場合は空配列を返す（呼び出し側でクラッシュしないよう
// playPhaseTrack 側にも空リストのガードを入れてある）。
// v47:
// folder/list.txt を読み込み、{ path, title } の配列を返す。
// list.txt は「ファイル名,原曲名」の2列形式（v47）。
// カンマ以降が無い行は、原曲名としてファイル名をそのまま使う。
// これで list.txt を一度に全部書き換えなくても動く。
// 読み込めなかった場合は空配列を返す（呼び出し側でクラッシュしないよう
// playPhaseTrack 側にも空リストのガードを入れてある）。
async function loadTrackList(folder) {
  try {
    const res = await fetch(`${folder}/list.txt`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    return lines.map((line) => {
      const [file, title] = line.split(',');
      return {
        path: `${folder}/${file.trim()}`,
        title: (title || file).trim()
      };
    });
  } catch (e) {
    console.error(`曲リストの読み込みに失敗: ${folder}/list.txt`, e);
    return [];
  }
}

// 6フォルダ分の list.txt を並行して読み込み、musicTracks/restTracksに反映する。
async function loadAllTracks() {
  const [morningWork, morningRest, noonWork, noonRest, nightWork, nightRest] = await Promise.all([
    loadTrackList(TRACK_FOLDERS.morning.work),
    loadTrackList(TRACK_FOLDERS.morning.rest),
    loadTrackList(TRACK_FOLDERS.noon.work),
    loadTrackList(TRACK_FOLDERS.noon.rest),
    loadTrackList(TRACK_FOLDERS.night.work),
    loadTrackList(TRACK_FOLDERS.night.rest)
  ]);
  musicTracks.morning = morningWork;
  restTracks.morning = morningRest;
  musicTracks.noon = noonWork;
  restTracks.noon = noonRest;
  musicTracks.night = nightWork;
  restTracks.night = nightRest;
}

// =====================================================================
// 曲の選択状態（v40）
// =====================================================================
// work: 実際に鳴らす作業曲のパス配列（最低1曲）
// rest: 実際に鳴らす休憩曲のパス（常に1曲だけ）
// localStorage にはパス（フォルダ名/ファイル名）で保存する。list.txt が
// 変わっても、消えた曲は normalizeTrackSelection で自動的に捨てられる。

const TRACK_SEL_KEY = 'bgmTimerTrackSelectionV1';

let trackSelection = {
  morning: { work: null, rest: null },
  noon:    { work: null, rest: null },
  night:   { work: null, rest: null }
};

function loadTrackSelection() {
  try {
    const raw = localStorage.getItem(TRACK_SEL_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    PHASES.forEach((p) => {
      if (!saved[p]) return;
      if (Array.isArray(saved[p].work)) trackSelection[p].work = saved[p].work;
      if (saved[p].rest) trackSelection[p].rest = saved[p].rest;
    });
  } catch (e) {
    console.warn('曲の選択状態の読み込みに失敗:', e);
  }
}

function saveTrackSelection() {
  try {
    localStorage.setItem(TRACK_SEL_KEY, JSON.stringify(trackSelection));
  } catch (e) {
    console.warn('曲の選択状態の保存に失敗:', e);
  }
}

// loadAllTracks の完了後に呼ぶ。存在しないファイル名を捨て、未設定なら
// 作業曲＝全曲・休憩曲＝先頭1曲を初期値にする。// loadAllTracks の完了後に呼ぶ。存在しないファイル名を捨て、未設定なら
// 作業曲＝全曲・休憩曲＝先頭1曲を初期値にする。
//
// v47: musicTracks/restTracks の要素が { path, title } になったため、
// 比較の前にパスだけの配列へ落とす。trackSelection と localStorage は
// これまで通りパスの文字列で保持する（保存形式を変えると既存の
// 選択が全部消えるため）。
function normalizeTrackSelection() {
  PHASES.forEach((p) => {
    const workPaths = (musicTracks[p] || []).map((t) => t.path);
    const restPaths = (restTracks[p] || []).map((t) => t.path);

    if (!Array.isArray(trackSelection[p].work)) {
      trackSelection[p].work = workPaths.slice();
    } else {
      trackSelection[p].work = trackSelection[p].work.filter((f) => workPaths.includes(f));
      if (trackSelection[p].work.length === 0) trackSelection[p].work = workPaths.slice();
    }

    if (!restPaths.includes(trackSelection[p].rest)) {
      trackSelection[p].rest = restPaths.length ? restPaths[0] : null;
    }
  });
  saveTrackSelection();
}

// 実際に再生に使う作業曲リスト。playPhaseTrack と applySegmentMusic が使う。
// 戻り値は { path, title } の配列。
// v47: trackSelection はパスの文字列で持っているので、比較は t.path で行う。
function effectiveWorkList(phase) {
  const all = musicTracks[phase] || [];
  const sel = trackSelection[phase].work;
  if (!Array.isArray(sel) || sel.length === 0) return all;
  const filtered = all.filter((t) => sel.includes(t.path));
  return filtered.length ? filtered : all;
}

// 休憩曲は切り替えの合図として働かせるため、常に1曲だけを返す。
// 戻り値が長さ1の配列になることで、区間内の均等分割（trackSlotSeconds）が
// 自動的に無効になり、休憩中は曲が変わらない。
function effectiveRestList(phase) {
  const all = restTracks[phase] || [];
  if (all.length === 0) return [];
  const sel = trackSelection[phase].rest;
  const found = all.find((t) => t.path === sel);
  return [found || all[0]];
}

// ---- 自然音（重ねがけレイヤー。BGM/クロスフェード系とは完全に独立） ----
const NATURE_SOUNDS = {
  river:     { file: 'sound/n1_river.mp3',     label: '川' },
  waterfall: { file: 'sound/n2_waterfall.mp3', label: '滝' },
  waves:     { file: 'sound/n3_waves.mp3',     label: '波' },
  campfire:  { file: 'sound/n4_campfire.mp3',  label: '焚き火' },
  insects:   { file: 'sound/n5_insects.mp3',   label: '虫の声' },
  higurashi: { file: 'sound/n6_higurashi.mp3', label: 'ひぐらし' },
  windchime: { file: 'sound/n7_windchime.mp3', label: '風鈴' },
  rain:      { file: 'sound/n8_rain.mp3',      label: '雨' }
};

// =====================================================================
// 設定（v27）
// =====================================================================

const SETTINGS_KEY = 'bgmTimerSettingsV1';

const DEFAULT_SETTINGS = {
  bgmVol: 0.7,     // BGM 起動時音量
  natureVol: 0.5,  // 自然音 起動時音量
  workMin: 25,     // 作業区間（分）
  restMin: 5,      // 休憩区間（分）
  fadeSec: 2.5,    // クロスフェード（秒）
  speed: 1.0,      // BGM再生スピード（0.75〜1.25）
  endSound: true   // 合図音（区間の切り替わり・全体の終了）のオン/オフ
};

let SETTINGS = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) SETTINGS = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('設定の読み込みに失敗。初期値を使用:', e);
    SETTINGS = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
  } catch (e) {
    console.warn('設定の保存に失敗:', e);
  }
}

// ---- 応援リンク（自分のページURLを設定。空なら「準備中」表示） ----
const SUPPORT_URL = '';

let natureVolume = DEFAULT_SETTINGS.natureVol; // 起動時に SETTINGS で上書き
const natureAudios = {};                       // 再生中のものだけ key→Audio を保持

// 1つの自然音をトグル（再生/停止）。複数同時再生を許す。
function toggleNature(key, btn) {
  if (natureAudios[key]) {
    natureAudios[key].pause();
    natureAudios[key].currentTime = 0;
    delete natureAudios[key];
    if (btn) btn.classList.remove('active');
    return;
  }
  const s = NATURE_SOUNDS[key];
  if (!s) return;
  const a = new Audio(s.file);
  a.loop = true;
  a.volume = natureVolume;
  a.addEventListener('error', (e) => console.error(`自然音の読み込みエラー: ${s.file}`, e));
  a.play()
    .then(() => console.log(`自然音再生: ${s.file}`))
    .catch((err) => console.error('自然音再生エラー:', err));
  natureAudios[key] = a;
  if (btn) btn.classList.add('active');
}

// 自然音の音量を一括変更
function setNatureVolume(v) {
  natureVolume = clampVol(v);
  Object.values(natureAudios).forEach((a) => { a.volume = natureVolume; });
  const lbl = document.getElementById('nature-volume-value');
  if (lbl) lbl.textContent = Math.round(natureVolume * 100) + '%';
  const slider = document.getElementById('nature-volume-slider');
  if (slider) slider.value = Math.round(natureVolume * 100);
}

// 自然音を全部止める（「すべて停止」から呼ぶ）
function stopAllNature() {
  Object.values(natureAudios).forEach((a) => { a.pause(); a.currentTime = 0; });
  for (const k in natureAudios) delete natureAudios[k];
  document.querySelectorAll('.nature-btn').forEach((b) => b.classList.remove('active'));
}

// 作業曲・休憩曲、それぞれ独立したインデックス管理（時間帯ごと）
// v40: これらは「選択後のリスト（effective*List）の中での位置」を指す。
// 選択内容を変えたときは 0 に戻す。
let currentMusicIndex = { morning: 0, noon: 0, night: 0 }; // 作業曲
let currentRestIndex = { morning: 0, noon: 0, night: 0 };  // 休憩曲

// currentPlayingPhase は常に 'morning' | 'noon' | 'night' | null。
// 作業か休憩かの区別は currentSegmentType（'work' | 'rest'）で別途持つ。
let currentPlayingPhase = null;
let currentSegmentType = null;   // 'work' | 'rest' | null（表示ラベル用）
let currentPlayingLabel = null;
let currentAudio = null;

// ---- 曲送り判定用の記憶変数（v29でwork用、v30でrest用を追加） ----
// 「直前に実際に鳴らしていた時間帯」を作業・休憩それぞれ別に記憶する。
// 今回鳴らす時間帯と一致していれば「同じ時間帯に戻ってきた」＝曲を1つ進める。
// 一致していなければ（nullも含む）「初めて」＝曲を進めず今のインデックスのまま。
let lastWorkPhase = null;
let lastRestPhase = null;

// v42: ループ回数を時間帯ごとに持つ（v31で共通化したものを再び分離）。
// 人によって朝・昼・夜で自由に使える時間が違うので、朝1回・昼2回・夜4回の
// ように個別に指定できる。値は localStorage に保存し、次回もそのまま使う。
let loopCounts = { morning: 2, noon: 2, night: 2 };
const LOOP_MIN = 1;
const LOOP_MAX = 24;
const LOOP_COUNTS_KEY = 'bgmTimerLoopCountsV1';

function loadLoopCounts() {
  try {
    const raw = localStorage.getItem(LOOP_COUNTS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    PHASES.forEach((p) => {
      const v = saved[p];
      if (Number.isInteger(v) && v >= LOOP_MIN && v <= LOOP_MAX) loopCounts[p] = v;
    });
  } catch (e) {
    console.warn('ループ回数の読み込みに失敗:', e);
  }
}

function saveLoopCounts() {
  try {
    localStorage.setItem(LOOP_COUNTS_KEY, JSON.stringify(loopCounts));
  } catch (e) {
    console.warn('ループ回数の保存に失敗:', e);
  }
}

function refreshLoopCountDisplays() {
  PHASES.forEach((p) => {
    const el = document.getElementById(`${p}-loop-n`);
    if (el) el.textContent = loopCounts[p];
  });
}

function adjustLoopCount(phase, delta) {
  const next = loopCounts[phase] + delta;
  if (next < LOOP_MIN || next > LOOP_MAX) return;
  loopCounts[phase] = next;
  saveLoopCounts();
  const el = document.getElementById(`${phase}-loop-n`);
  if (el) el.textContent = next;
}


// ---- クロスフェード設定 ----
let TARGET_VOLUME = DEFAULT_SETTINGS.bgmVol; // 起動時に SETTINGS で上書き
const FADE_TICK_MS = 50;                     // フェード更新間隔

function fadeMs() { return Math.max(0, SETTINGS.fadeSec * 1000); }

// =====================================================================
// 統合状態オブジェクト
// =====================================================================
const TM = {
  // 'idle' | 'loop'（Nループ・無限ループ共通）| 'continuous' | 'workOnly' | 'restOnly'
  mode: 'idle',
  cycle: '25min',    // 現在の区間種別 '25min'(作業) | '5min'(休憩) ※識別子。実時間は SETTINGS
  phaseIndex: 0,     // continuous の時間帯インデックス（PHASES）
  timeOfDay: null,   // loop/workOnly/restOnly 用の対象時間帯ラベル（'朝' | '昼' | '夜'）
  loopTarget: 0,     // loop モードでの目標ループ数（0=無制限）
  loopsDone: 0,      // loop モードで消化済みのループ数
  remaining: 0,      // 現区間の残り秒
  status: 'idle',    // 'idle' | 'running' | 'paused' | 'gap' | 'paused_gap'
  intervalId: null,  // カウントダウンの setInterval ID
  gapId: null,       // 区間間ギャップの setTimeout ID

  // v33: 区間の中で曲を均等分割して自動的に次の曲へ切り替えるための管理項目。
  // 曲が1つだけの区間（休憩は常にそう）では trackSlotSeconds が null になり、
  // 強制切り替えは起きない。
  trackSlotSeconds: null,   // 1曲あたりに割り当てる秒数
  trackRemaining: null,     // 次の強制切り替えまでの残り秒
  trackSwitchesDone: 0,     // この区間で強制切り替えした回数
  trackSwitchesTarget: 0    // この区間で必要な強制切り替え回数（曲数-1）
};

let activeButton = null;

// =====
// iphoneにて連続再生されなかったので仕様変更
// iOS Safari は new Audio() のたびにファイルを再取得するため、
// 要素を固定で持って src を差し替える方式にする。
// =====
const audioPool = [new Audio(), new Audio(), new Audio()];
let poolIndex = 0;
function takeAudio() {
  const a = audioPool[poolIndex];
  poolIndex = (poolIndex + 1) % audioPool.length;
  return a;
}

let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  audioPool.forEach(a => {
    a.play().then(() => a.pause()).catch(() => {});
  });
}

// =====================================================================
// 音楽再生（クロスフェード層）
// =====================================================================

// iphoneのテスト用　終わったら消す
const _log = console.log;
console.log = (...a) => {
  _log(...a);
  const d = document.getElementById('dbg');
  if (d) d.textContent = a.join(' ') + '\n' + d.textContent.slice(0, 500);
};

let fadeTimer = null;        // 進行中フェードの interval ID
let retiringAudios = [];     // フェードアウト中の旧トラック（複数保持できる）

function cancelFade(finishOutgoing) {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
  if (finishOutgoing) {
    retiringAudios.forEach((a) => { a.pause(); a.currentTime = 0; });
    retiringAudios = [];
  }
}


function playAudioFile(file) {
  cancelFade(true);

  if (currentAudio) retiringAudios.push(currentAudio);

  let newAudio;
  try {
    newAudio = takeAudio();

    // 要素を使い回すため addEventListener だと毎回リスナーが積み上がる。
    // プロパティ代入なら上書きされるので多重発火しない。
    newAudio.onerror = (e) => {
      console.error(`音楽ファイルの読み込みエラー: ${file}`, e);
    };
    newAudio.onended = () => {
      if (newAudio === currentAudio) {
        playAudioFile(file);
      }
    };

    newAudio.loop = false;
    newAudio.volume = 0;
    newAudio.playbackRate = SETTINGS.speed;
    newAudio.src = file;
    newAudio.currentTime = 0;

    newAudio.play()
      .then(() => {
        console.log('再生開始', file, newAudio.paused, newAudio.volume);
      })
      .catch((err) => console.error('音楽再生エラー:', file, err));
  } catch (err) {
    console.error('音楽再生の初期化エラー:', err);
    return;
  }

  currentAudio = newAudio;
  startCrossfade();
}

function startCrossfade() {
  const ms = fadeMs();

  // フェード0秒設定、または不正値なら即時切替
  if (!Number.isFinite(ms) || ms <= 0) {
    if (currentAudio) currentAudio.volume = TARGET_VOLUME;
    retiringAudios.forEach((a) => { a.pause(); a.currentTime = 0; });
    retiringAudios = [];
    return;
  }

  const steps = Math.max(1, Math.round(ms / FADE_TICK_MS)) || 30; // NaN対策の最終防波堤
  let step = 0;
  const outStarts = retiringAudios.map((a) => a.volume);

  fadeTimer = setInterval(() => {
    step++;
    const p = Math.min(1, step / steps);

    if (currentAudio) {
      currentAudio.volume = clampVol(TARGET_VOLUME * Math.sin(p * Math.PI / 2));
    }
    retiringAudios.forEach((a, i) => {
      a.volume = clampVol(outStarts[i] * Math.cos(p * Math.PI / 2));
    });

    if (p >= 1 || step > steps + 20) { // 安全弁：想定回数を超えたら強制終了
      clearInterval(fadeTimer);
      fadeTimer = null;
      if (currentAudio) currentAudio.volume = TARGET_VOLUME;
      retiringAudios.forEach((a) => { a.pause(); a.currentTime = 0; });
      retiringAudios = [];
    }
  }, FADE_TICK_MS);
}

// 区間終了の直前に、前の曲だけを落とす。クロスフェードではなくフェードアウト単独。
function startFadeOutOnly() {
  const ms = fadeMs();
  if (!Number.isFinite(ms) || ms <= 0) return;
  if (!currentAudio) return;

  cancelFade(false); // 進行中のフェードは止めるが retiringAudios には触らない
  const target = currentAudio;
  const startVol = target.volume;
  const steps = Math.max(1, Math.round(ms / FADE_TICK_MS));
  let step = 0;

  fadeTimer = setInterval(() => {
    step++;
    const p = Math.min(1, step / steps);
    target.volume = clampVol(startVol * Math.cos(p * Math.PI / 2));
    if (p >= 1 || step > steps + 20) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      target.volume = 0;
    }
  }, FADE_TICK_MS);
}


function clampVol(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clearPlayingMark() {
  if (currentPlayingPhase) {
    const w = document.querySelector(`[data-phase="${currentPlayingPhase}"]`);
    if (w) w.classList.remove('playing');
  }
}

// 汎用トラック再生関数。作業曲・休憩曲どちらもこれ1つで扱う。
// phase:   'morning' | 'noon' | 'night'
// isRest:  true＝休憩曲、false＝作業曲
// advance: true なら次の曲へ進めてから再生。false なら今のインデックスのまま。
//
// v40: 再生対象は選択後のリスト（effectiveWorkList/effectiveRestList）。
// ただし画面に出す番号は、選択後の並びではなく元のリスト（list.txt）での
// 通し番号を使う。設定＞クレジット欄の「朝1」等と番号がずれないようにするため。
function playPhaseTrack(phase, isRest, advance, immediate = false) {
  const list = isRest ? effectiveRestList(phase) : effectiveWorkList(phase);
  const indexByPhase = isRest ? currentRestIndex : currentMusicIndex;

  // list.txt がまだ読み込み中/見つからない/中身が空の場合はここで止める。
  if (list.length === 0) {
    console.warn(`${phase} の${isRest ? '休憩' : '作業'}曲リストが空です（list.txtの読み込み中か、見つからない可能性）`);
    return;
  }

  clearPlayingMark();

  if (advance) indexByPhase[phase] += 1;
  // 選択を変えた直後などで範囲外になっていたら先頭へ戻す
  if (indexByPhase[phase] >= list.length || indexByPhase[phase] < 0) indexByPhase[phase] = 0;

    // v47: list の要素が { path, title } になったため、track として受けて
  // 再生には path、表示には title を使う。
  const track = list[indexByPhase[phase]];
  const file = track.path;
  const fullList = isRest ? restTracks[phase] : musicTracks[phase];
  // 選択で絞ったリストと元のリストは同じオブジェクトを共有しているが、
  // 将来 map で作り直しても壊れないよう path で照合する。
  const dispNo = fullList.findIndex((t) => t.path === track.path) + 1;
  
  // 作業・休憩どちらでも、その時間帯の行を「再生中」としてハイライトする
  const w = document.querySelector(`[data-phase="${phase}"]`);
  if (w) w.classList.add('playing');

  currentPlayingPhase = phase;
  currentSegmentType = isRest ? 'rest' : 'work';
  currentPlayingLabel = isRest
    ? `${LABEL_BY_PHASE[phase]}(休)${dispNo}`
    : `${LABEL_BY_PHASE[phase]}${dispNo}`;

 // 行内の♪表示は作業曲の時だけ更新する。
  // 「2/3曲目」＝選んだ3曲のうち2曲目。停止中は「選曲数: 3」に戻る。
  if (!isRest) {
    const trackEl = document.getElementById(`${phase}-track`);
    if (trackEl) trackEl.textContent = `${indexByPhase[phase] + 1}/${list.length}曲目`;
  }

  playAudioFile(file, immediate);
  updateStatusDisplay();
}

// ---- 再生ラッパー ----
function switchMusic(phase) { playPhaseTrack(phase, false, true); }

function selectMusicWithoutChanging(phase) { playPhaseTrack(phase, false, false); }
function switchRestMusic(phase) { playPhaseTrack(phase, true, true); }
function selectRestMusicWithoutChanging(phase) { playPhaseTrack(phase, true, false); }

// v40: 時間帯ラベル横の♪表示。停止中は「何曲を選んでいるか」を出し、
// 再生中は playPhaseTrack が実際の曲番号（♪3など）で上書きする。
function updatePhaseTrackLabel(phase) {
  const el = document.getElementById(`${phase}-track`);
  if (!el) return;
  const all = musicTracks[phase] || [];
  if (all.length === 0) { el.textContent = '選曲数: -'; return; }
    el.textContent = `選曲数: ${effectiveWorkList(phase).length}`;
}
function refreshAllPhaseTrackLabels() { PHASES.forEach(updatePhaseTrackLabel); }

function stopMusic() {
  cancelFade(true);
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

// =====================================================================
// 合図音（v41。Web Audio APIで合成するので音源ファイルは不要）
// =====================================================================
// オシレーターで作っているため、周波数と長さを変えるだけで何種類でも増やせる。
//   playToRestSound : 作業→休憩（下降。緩む合図）
//   playToWorkSound : 休憩→作業（上昇。締める合図）
//   playEndSound    : 全体の終了（上昇の2音。区間の合図より強め）

let endSoundCtx = null;

function playTone(notes, gainPeak) {
  try {
    if (!endSoundCtx) {
      endSoundCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = endSoundCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const peak = gainPeak || 0.22;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(peak, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    });
  } catch (e) {
    console.warn('合図音の再生に失敗:', e);
  }
}

// 作業→休憩（作業の終わり）。「ペポン」。2音。
function playToRestSound() {
  playTone([
    { freq: 880.0,  start: 0,    dur: 0.14 },
    { freq: 659.25, start: 0.12, dur: 0.45 }
  ], 0.16);
}

// 休憩→作業（休憩の終わり）。「ぺぺポン」。短い2音のあとに1音。
function playToWorkSound() {
  playTone([
    { freq: 659.25, start: 0,    dur: 0.12 },
    { freq: 659.25, start: 0.11, dur: 0.12 },
    { freq: 880.0,  start: 0.22, dur: 0.5 }
  ], 0.16);
}

// 全体の終了。「ポン・ペン・ポーン」下降3音、重ねない。
function playEndSound() {
  playTone([
    { freq: 880.0,  start: 0,    dur: 0.22 },
    { freq: 659.25, start: 0.26, dur: 0.22 },
    { freq: 440.0,  start: 0.52, dur: 0.8 }
  ]);
}

// =====================================================================
// 表示
// =====================================================================

function cycleLabel() {
  return TM.cycle === '25min' ? `${SETTINGS.workMin}分` : `${SETTINGS.restMin}分`;
}
// v42: 区間の種別を「作業曲／休憩曲」という言葉で返す。
// 分数は残り時間の表示で分かるので、ここでは何が鳴っているかを示す。
function segmentLabel() {
  return TM.cycle === '25min' ? '作業曲' : '休憩曲';
}

// v42: 表示の形を「どこで・何を・どこまで」の順に組み替えた。
// 例: 昼 作業 ♪ 昼2 再生中 (ループ 1/2)
// 行の中の「1/4曲目」は選んだ曲の進み具合、こちらの「昼2」は list.txt での
// 通し番号。設定＞クレジット欄と対応するので、役割が重ならない。
function updateStatusDisplay() {
  const el = document.getElementById('timer-status');
  if (!el) return;

  const track = currentPlayingLabel ? ` ♪ ${currentPlayingLabel}` : '';

  if (TM.status === 'paused' || TM.status === 'paused_gap') {
    el.textContent = '一時停止中' + track;
    return;
  }
  if (TM.status === 'idle' || TM.remaining <= 0) {
    el.textContent = currentPlayingLabel ? `♪ ${currentPlayingLabel}` : '待機中';
    return;
  }

  // 時間帯（朝/昼/夜）。continuous は巡回中の時間帯を使う。
  const where = (TM.mode === 'continuous')
    ? LABEL_BY_PHASE[PHASES[TM.phaseIndex]]
    : (TM.timeOfDay || '');

  // 作業か休憩か
  const what = (TM.cycle === '25min') ? '作業' : '休憩';

  // 末尾の括弧。ループ系だけ付ける（単発モードは進捗が無い）。
  let progress = '';
  if (TM.mode === 'loop') {
    progress = TM.loopTarget
      ? ` (ループ ${TM.loopsDone + 1}/${TM.loopTarget})`
      : ` (ループ ${TM.loopsDone + 1})`;
  } else if (TM.mode === 'continuous') {
    progress = ' (全体ループ)';
  }

  el.textContent = `${where} ${what}${track} 再生中${progress}`;
}

function updateDisplay() {
  const m = Math.floor(TM.remaining / 60);
  const s = TM.remaining % 60;
  const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const tr = document.getElementById('timer-remaining');
  if (tr) tr.textContent = str;

  updateStatusDisplay();
}

function setDisplayActive() {
  const td = document.getElementById('timer-display');
  if (td) { td.classList.remove('paused'); td.classList.add('active'); }
}

function setDisplayPaused() {
  const td = document.getElementById('timer-display');
  if (td) { td.classList.remove('active'); td.classList.add('paused'); }
}

// =====================================================================
// 状態機械コア
// =====================================================================

function clearTimers() {
  if (TM.intervalId) { clearInterval(TM.intervalId); TM.intervalId = null; }
  if (TM.gapId) { clearTimeout(TM.gapId); TM.gapId = null; }
}

// TM.mode / TM.timeOfDay / TM.phaseIndex から「今対象にしている時間帯」を
// 割り出す共通ロジック。applySegmentMusic と advanceCurrentTrack の両方が使う。
function resolveCurrentPhase() {
  if (TM.mode === 'loop' || TM.mode === 'workOnly' || TM.mode === 'restOnly') {
    return PHASE_BY_LABEL[TM.timeOfDay];
  } else if (TM.mode === 'continuous') {
    return PHASES[TM.phaseIndex];
  }
  return null;
}

// 各区間（作業/休憩）が始まるたびに呼ばれ、その区間の1曲目を決めて再生し、
// あわせて「区間内で曲を均等分割して自動的に次へ進める」タイマーをセットする。
function applySegmentMusic() {
  const phase = resolveCurrentPhase();
  if (!phase) return; // 万一 phase が決まらない異常系は何もしない

  const isRest = (TM.cycle === '5min');

  // ---- 区間の1曲目を選ぶ ----
  // 区間をまたいだ「続き」か「初めて」かの判定（lastWorkPhase / lastRestPhase 方式）。
  if (isRest) {
    if (phase === lastRestPhase) {
      switchRestMusic(phase);
    } else {
      selectRestMusicWithoutChanging(phase);
    }
    lastRestPhase = phase;
    // 注意: 作業側の記憶（lastWorkPhase）はここでは更新しない。
  } else {
    if (phase === lastWorkPhase) {
      switchMusic(phase);
    } else {
      selectMusicWithoutChanging(phase);
    }
    lastWorkPhase = phase;
  }

  // ---- 区間内の均等分割セットアップ ----
  // 例: 作業曲を4曲選択・作業時間25分なら、25分÷4＝約6分ごとに次の曲へ。
  // v40: 休憩は effectiveRestList が常に長さ1を返すので、必ず下の else に
  // 入って強制切り替えが無効になる（＝休憩中は同じ曲が鳴り続ける）。
  const list = isRest ? effectiveRestList(phase) : effectiveWorkList(phase);
  const totalSec = segmentSeconds();
  if (list.length > 1) {
    TM.trackSlotSeconds = Math.max(1, Math.floor(totalSec / list.length));
    TM.trackSwitchesTarget = list.length - 1; // N曲なら切り替えはN-1回で全曲を使い切る
  } else {
    TM.trackSlotSeconds = null;
    TM.trackSwitchesTarget = 0;
  }
  TM.trackRemaining = TM.trackSlotSeconds;
  TM.trackSwitchesDone = 0;
}

// 区間内での曲送り（均等分割による強制切り替え）専用。
function advanceCurrentTrack() {
  const phase = resolveCurrentPhase();
  if (!phase) return;
  if (TM.cycle === '5min') {
    switchRestMusic(phase);
  } else {
    switchMusic(phase);
  }
}

function segmentSeconds() {
  return TM.cycle === '25min' ? SETTINGS.workMin * 60 : SETTINGS.restMin * 60;
}

function beginSegment() {
  applySegmentMusic();
  TM.remaining = segmentSeconds();
  startCountdown();
  updateControlButtons();
}

function startCountdown() {
  TM.status = 'running';
  updateDisplay();
  setDisplayActive();

  TM.intervalId = setInterval(() => {
    TM.remaining--;

    // 区間が終わる瞬間（remaining<=0）と同時に発火しないよう、
    // remaining>0 のときだけ処理する。
    if (TM.remaining > 0 && TM.trackSlotSeconds) {
      TM.trackRemaining--;
      if (TM.trackRemaining <= 0 && TM.trackSwitchesDone < TM.trackSwitchesTarget) {
        advanceCurrentTrack();
        TM.trackSwitchesDone++;
        TM.trackRemaining = TM.trackSlotSeconds;
      }
    }
    // 区間終了の fadeSec 秒前になったら、前の曲だけ先に落とし始める。
    // 境界に達した時点で音量0になっているので、次の曲は即切りで立ち上がる。
    if (TM.remaining === Math.max(1, Math.ceil(SETTINGS.fadeSec)) && currentAudio) {
      console.log('fadeout start', TM.remaining, SETTINGS.fadeSec, currentAudio.volume);
      startFadeOutOnly();
    }

    updateDisplay();
    if (TM.remaining <= 0) {
      clearInterval(TM.intervalId);
      TM.intervalId = null;
      onSegmentComplete();
    }
  }, 1000);
}

// ループ系（loop/continuous）で次区間へ状態を1歩進める。
// loop モードは 休憩→作業 の切り替わりで1ループ消化とみなす。
// この関数は状態を進めるだけで、音や表示には一切触れない。
function advanceState() {
  if (TM.cycle === '25min') {
    TM.cycle = '5min';
  } else {
    TM.cycle = '25min';
    if (TM.mode === 'continuous') {
      TM.phaseIndex = (TM.phaseIndex + 1) % PHASES.length;
    }
    if (TM.mode === 'loop') {
      TM.loopsDone += 1;
    }
  }
}

function onSegmentComplete() {
  // 単発モード（25分だけ／5分だけ）は、区間が終わったら次へチェーンせず終了。
  if (TM.mode === 'workOnly' || TM.mode === 'restOnly') {
    finishRun();
    return;
  }

  advanceState();

  // loop モードで目標ループ数（0=無制限は対象外）に到達したかどうか。
  // 到達していれば下で finishRun が終了音を鳴らすので、切り替え音は鳴らさない。
  const willFinish = (TM.mode === 'loop' && TM.loopTarget && TM.loopsDone >= TM.loopTarget);

 // v41: 区間が切り替わった合図。advanceState の後なので TM.cycle は
  // 「これから始まる区間」を指している。1秒のギャップ中に鳴るため、
  // 次の曲のフェードインとは重ならない。
  stopMusic();  // ← 追加。前倒しフェードで音量0のはずだが、確実に切る
  if (!willFinish && SETTINGS.endSound) {
    if (TM.cycle === '5min') playToRestSound(); else playToWorkSound();
  }

  if (willFinish) {
    finishRun();
    return;
  }

  TM.status = 'gap';
  updateControlButtons();
  TM.gapId = setTimeout(() => {
    TM.gapId = null;
    if (TM.mode === 'loop' || TM.mode === 'continuous') beginSegment();
  }, 
 );
}

// 完了 → 音楽も含めて自然停止し、状態を完全リセット
function finishRun() {
  const el = document.getElementById('timer-status');
  if (el) el.textContent = '完了！';

  stopMusic();
  if (SETTINGS.endSound) setTimeout(playEndSound, 250);

  clearPlayingMark();
  currentPlayingPhase = null;
  currentSegmentType = null;
  currentPlayingLabel = null;
  lastWorkPhase = null; // 次回起動は必ず「初めて」扱いにする
  lastRestPhase = null;

  if (activeButton) { activeButton.classList.remove('active'); activeButton = null; }
  TM.mode = 'idle';
  TM.status = 'idle';
  TM.cycle = '25min';
  TM.loopTarget = 0;
  TM.loopsDone = 0;
  TM.remaining = 0;
  TM.trackSlotSeconds = null;
  TM.trackRemaining = null;
  TM.trackSwitchesDone = 0;
  TM.trackSwitchesTarget = 0;

  refreshAllPhaseTrackLabels(); // ♪表示を「選択曲数」に戻す
  updateControlButtons();

  setTimeout(() => {
    const tr = document.getElementById('timer-remaining');
    const td = document.getElementById('timer-display');
    if (tr) tr.textContent = '--:--';
    if (td) td.classList.remove('active', 'paused');
    updateStatusDisplay();
  }, 3000);
}

// =====================================================================
// 各タイマー起動（公開API）
// =====================================================================

// 回数指定ループ。count=0 を渡すと「無制限ループ」になる
// （onSegmentComplete の loopTarget 判定が0を偽と評価するため自動停止しない）。
function startLoopSet(phase, count, btn) {
  console.log(`${phase} ループ開始 x${count === 0 ? '無制限' : count}`);

  // 同じボタンをもう一度押したら停止（トグル）
  if (btn && btn === activeButton) { resetBgmState(); return; }

  resetBgmState();

  if (btn) {
    btn.classList.add('active');
    activeButton = btn;
  }

  TM.mode = 'loop';
  TM.cycle = '25min';
  TM.timeOfDay = LABEL_BY_PHASE[phase];
  TM.loopTarget = count;
  TM.loopsDone = 0;

  beginSegment();
}

// 「25分」ボタン。作業曲だけを1回、workMin分再生して終了。
function startWorkOnly(phase, btn) {
  console.log(`${phase} 作業のみ再生（単発）`);

  if (btn && btn === activeButton) { resetBgmState(); return; }

  resetBgmState();

  if (btn) {
    btn.classList.add('active');
    activeButton = btn;
  }

  TM.mode = 'workOnly';
  TM.cycle = '25min';
  TM.timeOfDay = LABEL_BY_PHASE[phase];
  TM.loopTarget = 0;
  TM.loopsDone = 0;

  beginSegment();
}

// 「5分」ボタン。休憩曲だけを1回、restMin分再生して終了。
function startRestOnly(phase, btn) {
  console.log(`${phase} 休憩のみ再生（単発）`);

  if (btn && btn === activeButton) { resetBgmState(); return; }

  resetBgmState();

  if (btn) {
    btn.classList.add('active');
    activeButton = btn;
  }

  TM.mode = 'restOnly';
  TM.cycle = '5min';
  TM.timeOfDay = LABEL_BY_PHASE[phase];
  TM.loopTarget = 0;
  TM.loopsDone = 0;

  beginSegment();
}

// 連続ループ（朝→昼→夜を作業/休憩で順送り、無制限）
function startContinuousLoop() {
  console.log('連続ループ開始');
  const playAllBtn = document.getElementById('play-all');

  if (playAllBtn && playAllBtn === activeButton) { resetBgmState(); return; }

  resetBgmState();

  if (playAllBtn) { playAllBtn.classList.add('active'); activeButton = playAllBtn; }

  TM.mode = 'continuous';
  TM.cycle = '25min';
  TM.phaseIndex = 0;
  TM.loopTarget = 0;
  beginSegment();
}

// =====================================================================
// 一時停止 / 再開 / 停止
// =====================================================================

function pauseTimer() {
  if (TM.status === 'running' && TM.intervalId) {
    clearInterval(TM.intervalId);
    TM.intervalId = null;
    TM.status = 'paused';
  } else if (TM.status === 'gap' && TM.gapId) {
    clearTimeout(TM.gapId);
    TM.gapId = null;
    TM.status = 'paused_gap';
  } else {
    return;
  }

  cancelFade(true);
  if (currentAudio) {
    currentAudio.volume = TARGET_VOLUME;
    currentAudio.pause();
  }

  setDisplayPaused();
  updateStatusDisplay();
  updateControlButtons();
}

function resumeTimer() {
  if (TM.status === 'paused') {
//　2026/08/19 11:50ごろ　再開エラー対処
    if (currentAudio) {
      currentAudio.play().catch(() => {
        currentAudio.load();
        currentAudio.play().catch((e) => console.error('再開エラー:', e));
      });
    }
    //
    startCountdown();
    updateControlButtons();
  } else if (TM.status === 'paused_gap') {
    beginSegment();
  } else {
    console.log('再開できるタイマーがありません');
  }
}

// v37: BGM/タイマーだけをリセットする内部処理。自然音には一切触れない。
// 新しい再生を始める直前（startLoopSet等の冒頭）や、同じボタンを
// もう一度押してトグル停止する時に呼ぶ。
function resetBgmState() {
  clearTimers();

  stopMusic();
  clearPlayingMark();
  currentPlayingPhase = null;
  currentSegmentType = null;
  currentPlayingLabel = null;
  lastWorkPhase = null; // ★重要: これがないと前回の続きと誤認識され、
  lastRestPhase = null; //   新しい開始のはずが2曲目から始まってしまう

  // タイマーを起動する系のボタンは全部 timer-action-btn クラスを持たせてあるので、
  // ここ1箇所でまとめてアクティブ表示を解除できる。
  document.querySelectorAll('.timer-action-btn').forEach((b) => b.classList.remove('active'));
  const playAllBtn = document.getElementById('play-all');
  if (playAllBtn) playAllBtn.classList.remove('active');

  TM.mode = 'idle';
  TM.cycle = '25min';
  TM.phaseIndex = 0;
  TM.timeOfDay = null;
  TM.loopTarget = 0;
  TM.loopsDone = 0;
  TM.remaining = 0;
  TM.status = 'idle';
  TM.trackSlotSeconds = null;
  TM.trackRemaining = null;
  TM.trackSwitchesDone = 0;
  TM.trackSwitchesTarget = 0;

  activeButton = null;

  const tr = document.getElementById('timer-remaining');
  const td = document.getElementById('timer-display');
  if (tr) tr.textContent = '--:--';
  if (td) td.classList.remove('active', 'paused');

  refreshAllPhaseTrackLabels(); // ♪表示を「選択曲数」に戻す
  updateStatusDisplay();
  updateControlButtons();
}

// 「すべて停止」ボタン専用。BGMのリセットに加えて、自然音（独立レイヤー）も止める。
function stopAllTimers() {
  console.log('すべてのタイマーを停止（自然音も含む）');
  resetBgmState();
  stopAllNature();
}

function setVolume(v) {
  TARGET_VOLUME = clampVol(v);
  if (!fadeTimer && currentAudio) currentAudio.volume = TARGET_VOLUME;
  const lbl = document.getElementById('volume-value');
  if (lbl) lbl.textContent = Math.round(TARGET_VOLUME * 100) + '%';
  const slider = document.getElementById('volume-slider');
  if (slider) slider.value = Math.round(TARGET_VOLUME * 100);
}

// =====================================================================
// ユーティリティ
// =====================================================================

// v41: 制御ボタンのアイコン。CSS側で fill が currentColor なので、
// ボタンの状態色（一時停止中のゴールド等）に自動で追従する。
const ICON_PAUSE = '<span class="ctrl-icon"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="4.5" width="4" height="15" rx="1.2"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.2"/></svg></span>';
const ICON_PLAY  = '<span class="ctrl-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8a1 1 0 0 1 1.5-.87l9.2 6.2a1 1 0 0 1 0 1.74l-9.2 6.2a1 1 0 0 1-1.5-.87z"/></svg></span>';

function updateControlButtons() {
  const pauseBtn = document.getElementById('pause-all');
  const playAllBtn = document.getElementById('play-all');

  if (pauseBtn) {
    if (TM.status === 'running' || TM.status === 'gap') {
      pauseBtn.disabled = false;
      pauseBtn.classList.remove('paused');
      pauseBtn.innerHTML = ICON_PAUSE + '<span>一時停止</span>';
      pauseBtn.onclick = pauseTimer;
    } else if (TM.status === 'paused' || TM.status === 'paused_gap') {
      // v41: paused クラスで、CSS側がゴールド＋押し込まれた見た目にする。
      pauseBtn.disabled = false;
      pauseBtn.classList.add('paused');
      pauseBtn.innerHTML = ICON_PLAY + '<span>再開</span>';
      pauseBtn.onclick = resumeTimer;
    } else {
      pauseBtn.disabled = true;
      pauseBtn.classList.remove('paused');
      pauseBtn.innerHTML = ICON_PAUSE + '<span>一時停止</span>';
      pauseBtn.onclick = pauseTimer;
    }
  }

  if (playAllBtn) {
    playAllBtn.classList.toggle('active', TM.mode === 'continuous');
  }
}

// =====================================================================
// 選曲モーダル（v40）
// =====================================================================
// 作業曲＝複数選択（チェックボックス、最低1曲）
// 休憩曲＝単一選択（ラジオ、常に1曲）

let trackSelectPhase = null;

function openTrackSelect(phase) {
  trackSelectPhase = phase;
  const title = document.getElementById('track-select-title');
  if (title) title.textContent = `🎵 ${LABEL_BY_PHASE[phase]}の曲を選ぶ`;
  renderTrackSelect();
  const ov = document.getElementById('track-select-overlay');
  if (ov) ov.classList.add('open');
}

function closeTrackSelect() {
  const ov = document.getElementById('track-select-overlay');
  if (ov) ov.classList.remove('open');
  trackSelectPhase = null;
}

function buildTrackRow(opt) {
  const row = document.createElement('label');
  row.className = 'track-row';

  const input = document.createElement('input');
  input.type = opt.type;
  input.name = opt.name;
  input.checked = opt.checked;
  input.addEventListener('change', (e) => opt.onChange(e.target.checked));

  const t = document.createElement('span');
  t.className = 'track-row-label';
  t.textContent = opt.label;

  const f = document.createElement('span');
  f.className = 'track-row-file';
  f.textContent = opt.fileName;

  row.appendChild(input);
  row.appendChild(t);
  row.appendChild(f);
  return row;
}

function renderTrackSelect() {
  const phase = trackSelectPhase;
  if (!phase) return;
  const label = LABEL_BY_PHASE[phase];

  const workBox = document.getElementById('track-work-list');
  if (workBox) {
    workBox.innerHTML = '';
    const sel = effectiveWorkList(phase);
    const all = musicTracks[phase] || [];
      // v47: fileName 欄にはファイル名ではなく原曲名を出す。
      // ファイル名を併記したい場合は track.path.split('/').pop() を足す。
      all.forEach((track, i) => {
        workBox.appendChild(buildTrackRow({
          type: 'checkbox',
          name: `tsel-work-${phase}`,
          label: `${label}${i + 1}`,
          fileName: track.title,
          checked: sel.some((t) => t.path === track.path),
          onChange: (checked) => toggleWorkTrack(track.path, checked)
        }));
      });

  }

  const restBox = document.getElementById('track-rest-list');
  if (restBox) {
    restBox.innerHTML = '';
    const all = restTracks[phase] || [];

    const cur = effectiveRestList(phase)[0] || null;
    if (all.length === 0) {
      restBox.textContent = '曲がありません（list.txt を確認してください）';
    } else {
      all.forEach((track, i) => {
        restBox.appendChild(buildTrackRow({
          type: 'radio',
          name: `tsel-rest-${phase}`,
          label: `${label}(休)${i + 1}`,
          fileName: track.title,
          checked: cur !== null && track.path === cur.path,
          onChange: () => setRestTrack(track.path)
        }));
      });

    }
  }
}

// v47: 引数はパスの文字列（オブジェクトではない）。
// trackSelection はパスで保持しているため、比較も保存もパスで統一する。
function toggleWorkTrack(path, checked) {
  const phase = trackSelectPhase;
  if (!phase) return;
  const allPaths = (musicTracks[phase] || []).map((t) => t.path);
  let sel = effectiveWorkList(phase).map((t) => t.path);

  if (checked) {
    if (!sel.includes(path)) sel.push(path);
  } else {
    // 最低1曲は残す（全部外して無音になるのを防ぐ）
    if (sel.length <= 1) { renderTrackSelect(); return; }
    sel = sel.filter((p) => p !== path);
  }

  // list.txt の並び順に整え直してから保存する
  trackSelection[phase].work = allPaths.filter((p) => sel.includes(p));
  saveTrackSelection();
  currentMusicIndex[phase] = 0;
  updatePhaseTrackLabel(phase);
  renderTrackSelect();
}

function setRestTrack(fullPath) {
  const phase = trackSelectPhase;
  if (!phase) return;
  trackSelection[phase].rest = fullPath;
  saveTrackSelection();
  currentRestIndex[phase] = 0;
  renderTrackSelect();
}

function selectAllWorkTracks() {
  const phase = trackSelectPhase;
  if (!phase) return;
  // v47: musicTracks の要素はオブジェクトなので、パスだけ抜いて保存する。
  trackSelection[phase].work = (musicTracks[phase] || []).map((t) => t.path);
  
  saveTrackSelection();
  currentMusicIndex[phase] = 0;
  updatePhaseTrackLabel(phase);
  renderTrackSelect();
}

// =====================================================================
// 設定モーダル（v27）
// =====================================================================

function openSettings() {
  syncSettingsUI();
  renderCredits();
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.add('open');
}

function closeSettings() {
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.remove('open');
}

// 設定UIに現在値を反映
function syncSettingsUI() {
  const bgmSlider = document.getElementById('set-bgm-vol');
  const bgmVal = document.getElementById('set-bgm-vol-val');
  if (bgmSlider) bgmSlider.value = Math.round(SETTINGS.bgmVol * 100);
  if (bgmVal) bgmVal.textContent = Math.round(SETTINGS.bgmVol * 100) + '%';

  const natSlider = document.getElementById('set-nature-vol');
  const natVal = document.getElementById('set-nature-vol-val');
  if (natSlider) natSlider.value = Math.round(SETTINGS.natureVol * 100);
  if (natVal) natVal.textContent = Math.round(SETTINGS.natureVol * 100) + '%';

  const workEl = document.getElementById('set-work-min');
  if (workEl) workEl.textContent = SETTINGS.workMin + '分';

  const restEl = document.getElementById('set-rest-min');
  if (restEl) restEl.textContent = SETTINGS.restMin + '分';

  const fadeEl = document.getElementById('set-fade-sec');
  if (fadeEl) fadeEl.textContent = SETTINGS.fadeSec + '秒';

  const speedEl = document.getElementById('set-speed');
  if (speedEl) speedEl.textContent = SETTINGS.speed.toFixed(2) + '倍';

  const endEl = document.getElementById('set-end-sound');
  if (endEl) endEl.checked = SETTINGS.endSound;
}

// --- 各設定の変更ハンドラ（即時保存・即時反映） ---

function onSettingBgmVol(v100) {
  SETTINGS.bgmVol = clampVol(v100 / 100);
  saveSettings();
  syncSettingsUI();
  setVolume(SETTINGS.bgmVol); // 現在のセッションにも反映
}

function onSettingNatureVol(v100) {
  SETTINGS.natureVol = clampVol(v100 / 100);
  saveSettings();
  syncSettingsUI();
  setNatureVolume(SETTINGS.natureVol); // 現在のセッションにも反映
}

const WORK_MIN_RANGE = { min: 5, max: 90 };
const REST_MIN_RANGE = { min: 1, max: 30 };
const FADE_SEC_RANGE = { min: 0, max: 5 };
const SPEED_RANGE = { min: 0.75, max: 1.25 };

// --- BGM再生スピード（±0.05） ---
function adjustSpeed(delta) {
  const next = Math.round((SETTINGS.speed + delta) * 100) / 100;
  if (next < SPEED_RANGE.min || next > SPEED_RANGE.max) return;
  SETTINGS.speed = next;
  saveSettings();
  syncSettingsUI();
  // 再生中のBGMに即反映（クロスフェード中の旧トラックにも）
  if (currentAudio) currentAudio.playbackRate = SETTINGS.speed;
  retiringAudios.forEach((a) => { a.playbackRate = SETTINGS.speed; });
}

// --- 合図音のオン/オフ（区間の切り替え音と終了音を一括で制御する） ---
function onToggleEndSound(checked) {
  SETTINGS.endSound = !!checked;
  saveSettings();
}

// v36: 「25分」「5分」ボタンの表示文字を、実際の設定値と同期させる。
function updateSegmentButtonLabels() {
  document.querySelectorAll('.segment-btn--work').forEach((b) => {
    b.textContent = `${SETTINGS.workMin}分`;
  });
  document.querySelectorAll('.segment-btn--rest').forEach((b) => {
    b.textContent = `${SETTINGS.restMin}分`;
  });
}

function adjustWorkMin(delta) {
  const next = SETTINGS.workMin + delta;
  if (next < WORK_MIN_RANGE.min || next > WORK_MIN_RANGE.max) return;
  SETTINGS.workMin = next;
  saveSettings();
  syncSettingsUI();
  updateSegmentButtonLabels();
  updateStatusDisplay();
}

function adjustRestMin(delta) {
  const next = SETTINGS.restMin + delta;
  if (next < REST_MIN_RANGE.min || next > REST_MIN_RANGE.max) return;
  SETTINGS.restMin = next;
  saveSettings();
  syncSettingsUI();
  updateSegmentButtonLabels();
  updateStatusDisplay();
}

function adjustFadeSec(delta) {
  const next = Math.round((SETTINGS.fadeSec + delta) * 10) / 10;
  if (next < FADE_SEC_RANGE.min || next > FADE_SEC_RANGE.max) return;
  SETTINGS.fadeSec = next;
  saveSettings();
  syncSettingsUI();
}

// 注意: これは「再生設定」のリセットであり、曲の選択状態（trackSelection）
// には触れない。曲の選択は選曲モーダルで操作する。
function resetSettings() {
  SETTINGS = { ...DEFAULT_SETTINGS };
  saveSettings();
  syncSettingsUI();
  setVolume(SETTINGS.bgmVol);
  setNatureVolume(SETTINGS.natureVol);
  if (currentAudio) currentAudio.playbackRate = SETTINGS.speed;
  retiringAudios.forEach((a) => { a.playbackRate = SETTINGS.speed; });
  updateSegmentButtonLabels();
  updateStatusDisplay();
}

// --- クレジット一覧の自動生成 ---
// v35: 実際に読み込まれた musicTracks/restTracks/NATURE_SOUNDS から都度生成する。
// 選択状態に関わらず、フォルダにある全曲を表示する（クレジット表示は
// 実際に鳴らしたかどうかとは無関係に必要なため）。
function renderCredits() {
  const box = document.getElementById('credits-list');
  if (!box) return;
  box.innerHTML = '';

  // 1グループ分（例: 朝、朝(休憩)、自然音）を描画する共通処理。
  function renderGroup(groupTitle, items) {
    if (!items || items.length === 0) return;

    const phaseEl = document.createElement('div');
    phaseEl.className = 'credit-phase';
    phaseEl.textContent = groupTitle;
    box.appendChild(phaseEl);

    items.forEach(({ fullPath, label }) => {
      const fileName = fullPath.split('/').pop();
      const meta = TRACK_CREDITS[fullPath] || {};
      const artistText = meta.artist || '未設定';

      const row = document.createElement('div');
      row.className = 'credit-row';

      const t = document.createElement('span');
      t.className = 'credit-title';
      t.textContent = `${label}（${fileName}）`;

      const a = document.createElement('span');
      a.className = 'credit-artist';
      if (meta.url) {
        const link = document.createElement('a');
        link.href = meta.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = artistText;
        a.appendChild(link);
      } else {
        a.textContent = artistText;
      }

      row.appendChild(t);
      row.appendChild(a);
      box.appendChild(row);
    });
  }

  // 作業曲・休憩曲（朝/昼/夜 × 2）
  PHASES.forEach((phase) => {
    const workLabel = LABEL_BY_PHASE[phase];
    renderGroup(
      workLabel,
      musicTracks[phase].map((fullPath, i) => ({ fullPath, label: `${workLabel}${i + 1}` }))
    );
    renderGroup(
      `${workLabel}（休憩）`,
      restTracks[phase].map((fullPath, i) => ({ fullPath, label: `${workLabel}(休)${i + 1}` }))
    );
  });

  // 自然音
  renderGroup(
    '自然音',
    Object.values(NATURE_SOUNDS).map((s) => ({ fullPath: s.file, label: s.label }))
  );
}

// --- 応援ボタン ---
function onSupportClick(event) {
  if (!SUPPORT_URL) {
    event.preventDefault();
    alert('応援ページは準備中です。');
    return false;
  }
  event.currentTarget.href = SUPPORT_URL;
  return true;
}

// =====================================================================
// 初期化
// =====================================================================

document.addEventListener('DOMContentLoaded', function () {
  console.log('BGMタイマー ScriptBGM.js v41 読み込み完了');

  // 設定と曲の選択状態の復元
  loadSettings();
  loadTrackSelection();
  loadLoopCounts();

  TARGET_VOLUME = SETTINGS.bgmVol;
  natureVolume = SETTINGS.natureVol;
  setVolume(TARGET_VOLUME);
  setNatureVolume(natureVolume);
  updateSegmentButtonLabels();
  refreshLoopCountDisplays();

  // 各フォルダの list.txt から曲リストを非同期で読み込む。
  // 完了するまでの短い間に再生ボタンが押された場合は
  // playPhaseTrack 側の空リストガードが静かに弾いてくれる。
  loadAllTracks().then(() => {
    normalizeTrackSelection();
    refreshAllPhaseTrackLabels();
    console.log('曲リストの読み込み完了:', musicTracks, restTracks);
  });

  // 背景タップで閉じる（モーダル本体のクリックは無視）
  const ov = document.getElementById('settings-overlay');
  if (ov) {
    ov.addEventListener('click', (e) => {
      if (e.target === ov) closeSettings();
    });
  }

  const tov = document.getElementById('track-select-overlay');
  if (tov) {
    tov.addEventListener('click', (e) => {
      if (e.target === tov) closeTrackSelect();
    });
  }

  // Escape キーで閉じる（開いていない方は空振りするだけなので両方呼ぶ）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSettings(); closeTrackSelect(); }
  });

  updateControlButtons();
  updateStatusDisplay();
});

console.log('ScriptBGM.js v45 読み込み完了');