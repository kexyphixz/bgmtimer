# CHANGELOG

異世界BGM25Timer の変更履歴。

---
### v64 — 自然音の音量制御を GainNode に移行

**症状**
iPhone で自然音の音量スライダーが効かない。Mac Safari では効く。

**原因**
v63 と同一。iOS では `HTMLMediaElement.volume` への代入が無視される。

**変更**
- `ensureNatureGain` を追加。自然音は音量の一括変更しかしないため、全要素を1つの GainNode に集約する
- 自然音の再生時に `createMediaElementSource` で要素を GainNode へ接続。要素は再生のたびに `new Audio()` で作られるため、「1要素につき1回」の制限には触れない
- `setNatureVolume` の要素ループを `natureGain.gain.value` への代入に置き換え

**備考**
BGM と自然音で GainNode を分けているため、音量は独立して制御される。接続先はどちらも同じ `destination`。

---

### v63 — BGMの音量制御を GainNode に移行

**症状**
iPhone（GitHub Pages経由）で、フェードイン・フェードアウトが両方とも効かない。BGMの音量スライダーも効かない。Mac Safari、Firefox、Android では正常に動作する。

**原因**
iOS Safari では `HTMLMediaElement.volume` への代入が無視され、読み出すと常に1が返る。Apple 公式の仕様で、音量は物理ボタンによるユーザー操作に限定されている。Mac Safari は設定・読み出しの両方が可能なため、開発環境では発覚しなかった。

**変更**
- `ensureBgmGain` を追加。`bgmAudio` を `createMediaElementSource` で AudioContext に通し、GainNode 経由で `destination` へ接続する。`createMediaElementSource` は要素1つにつき一度しか呼べないため、`bgmGain` が既にあれば何もしない
- AudioContext は合図音用の `endSoundCtx` を流用。新たに作ると iOS で複数コンテキストが競合するため
- `playAudioFile` の冒頭で `ensureBgmGain()` を呼ぶ
- 音量に触る箇所をすべて `bgmGain.gain.value` に置き換え
  - `setVolume`
  - `startFadeOutOnly`（開始値の取得、ループ内、終了時）
  - `startFadeInOnly`（フェード無効時、ループ内、終了時）
  - `playAudioFile` の開始音量
- フェード関数の早期returnの判定を `currentAudio` から `bgmGain` に変更

**備考**
`createMediaElementSource` を呼んだ時点で出力経路が AudioContext 側に移り、以降 `bgmAudio.volume` は実効の音量に影響しなくなる。接続直後に音量調節が効かなくなるのは想定どおりの挙動。

`setInterval` によるフェードの実装は変更していない。Web Audio の `linearRampToValueAtTime` を使えばタイマーの間引きに影響されなくなるが、差分を小さく保つため今回は見送った。

---
### v62 — フェード発火の取りこぼしを防止

**症状**
曲送り・区間終了のフェードアウトが、起きたり起きなかったりする。

**原因**
発火判定が等値（`===`）だった。`setInterval` は次のtickまでの時間を保証しないため、`src` の差し替えやデコードでメインスレッドが詰まると秒が飛ぶ（実際に 32秒→30秒 の飛びを確認）。判定値をまたいで飛ぶと、一度も一致せずフェードが起きない。

**変更**
- 曲送り・区間終了の両判定を `<=` に変更し、`TM.trackFadeStarted` / `TM.segFadeStarted` で一度だけ発火させる形にした
- 曲を切り替えた直後に `trackFadeStarted` を戻す
- `applySegmentMusic` の末尾と `resetBgmState` で両フラグを戻す
- `TM` の宣言に両フラグを追加。あわせて `tracｆkSwitchesTarget` の行末にカンマが無く、追加時に構文エラーになった点を修正
- 区間終了の判定が `if (TM.remaining > 0 && TM.trackSlotSeconds)` の内側に入り込んでいたため、外へ出した。曲送りが無効な区間（休憩など）でフェードアウトが起きなくなっていた

---

### v61 — retiringAudios の削除

**原因**
v48でクロスフェードを廃止した際、`retiringAudios` を扱うコードが残っていた。`playAudioFile` が毎回この配列を空にするため、`forEach` は常に何も回さない。`cancelFade` の `finishOutgoing` 分岐も同様に死んでいた。

**変更**
- `retiringAudios` の宣言と参照6箇所をすべて削除
- `cancelFade` から `finishOutgoing` の分岐と引数を廃止。`fadeTimer` の停止のみを行う関数にした
- 呼び出し側4箇所を `cancelFade()` に統一
- `startCrossfade` 削除済みを示すコメントを削除

**備考**
作業中、`startFadeOutOnly` 内でコメントを差し替えた際に改行が失われ、`const target = currentAudio;` がコメントに取り込まれる事故が起きた。`ReferenceError` で `setInterval` に到達せず、フェードアウトが無効になっていた。エディタの折り返しを有効にして再発を防ぐ。

---

### v60 — フェード時間の表示と保存値の丸め

**変更**
- `syncSettingsUI` で `fadeSec` が0のとき「なし」と表示するよう変更。「0秒」では機能が切れていることが伝わらないため
- `loadSettings` で `fadeSec` を整数かつ `FADE_SEC_RANGE` の範囲内に丸める処理を追加。刻みを1秒に変える前に保存された小数値や、`localStorage` の手動改変に備える
---

### v59 — フェードの二重発火ガード

**症状**
（未発生。予防的修正）

**原因**
`startFadeOutOnly` の呼び出し元が区間終了と曲送りの2箇所になった。同じtickで両方が発火すると `fadeTimer` が上書きされ、先に走っていた `setInterval` が停止されないまま残る。

**変更**
- `startFadeOutOnly` の冒頭に `if (fadeTimer) return;` を追加。`cancelFade(false)` より前に置く

---

### v58 — デバッグ出力の整理

**変更**
- `console.log('合図音判定', ...)` を削除。原因特定済み
- `console.log('fadeout start', ...)` を削除。v54の確認用
- 曲リスト読み込み完了ログを削除。異常時は `playPhaseTrack` の空リスト警告が出るため不要
- `adjustSpeed` のコメントからクロスフェードへの言及を削除

---

### v57 — 未使用変数の削除

**原因**
v53で選曲判定が `visitedWork` / `visitedRest` に移った際、`lastWorkPhase` / `lastRestPhase` を読む側が消えたが、代入だけが残っていた。

**変更**
- `resetBgmState` から `lastWorkPhase` / `lastRestPhase` への代入2行を削除

---

### v56 — 「全て停止」後に2曲目から始まる

**症状**
「全て停止」の後に再生を始めると、1曲目ではなく2曲目から鳴る。

**原因**
v52で曲順インデックスのリセットを追加したが、v53で導入した `visitedWork` / `visitedRest` は戻していなかった。フラグが `true` のまま残るため、`applySegmentMusic` が `switchMusic` を通り、インデックス0から1へ進んでいた。

**変更**
- `resetBgmState` の `PHASES.forEach` で `visitedWork[p]` / `visitedRest[p]` を `false` に戻す

---

### v55 — 25分/5分ボタンが反応しない

**症状**
25分・5分ボタンを押してもタイマーが起動しない。ステータス表示だけは更新される。

**原因**
v51.1 と同一。`startLoopSet` 用のログ行が `startWorkOnly` / `startRestOnly` にも貼られていた。v51.1 では `startContinuousLoop` の1箇所のみ修正しており、残る2箇所が見落とされていた。存在しない `count` を参照して `ReferenceError` が発生し、以降の処理が停止していた。

**変更**
- `startWorkOnly` / `startRestOnly` から該当行を削除

---

### v54 — フェードイン・フェードアウトの追加

**変更**
- `startFadeInOnly` を新規追加。`fadeMs()` が0以下の場合は `TARGET_VOLUME` を直接代入する
- `playAudioFile` の `volume` 初期値を `TARGET_VOLUME` から `0` に変更。`play()` の解決後に `startFadeInOnly` を呼ぶ
- `startCountdown` に曲送りの先行フェードアウト判定を追加。`trackRemaining` が `fadeSec` 秒を切った時点で発火する
- フェード時間の刻みを0.5秒から1秒に変更。発火が `Math.max(1, ...)` で1秒前に固定されるため、小数値では設定と実挙動がずれていた
- 初期化処理に残っていた古いバージョン表記（v41）のログを削除
- iOSで `volume` の代入が有効であることを実機で確認。Web Audio API への移行は不要と判断

### v53 — 連続ループでの曲順の記憶

**症状**
連続ループ中、フェーズが切り替わるたびに曲順が意図しない位置から始まる。

**原因**
区間開始時に次の曲へ進めるかどうかの判定が、フェーズ単位で保持されていなかった。

**変更**
- `visitedWork` / `visitedRest` を導入し、フェーズごとに一度でも再生したかを記憶する。初回は現在のインデックス（先頭）のまま鳴らし、2回目以降は次の曲へ進める
- ループ完了時にインデックスもリセットするよう修正

---

### v52 — 「すべて停止」での曲順リセット

**症状**
「すべて停止」の後に再生を始めると、前回の続きの曲から始まる。

**原因**
`resetBgmState` が `currentMusicIndex` / `currentRestIndex` に触れていなかった。

**変更**
- `resetBgmState` の `PHASES.forEach` で両インデックスを0に戻す
- 不要なデバッグログを削除
- バージョン番号の表記を更新

---
### v51.1 — 貼り間違いの修正

**症状**
全ループボタンが反応しない。

**原因**
v51の修正時、`startContinuousLoop` に `startLoopSet` 用のログ行を誤って貼り付けた。当該関数には `phase` も `count` も存在しないため、参照時に例外が発生し、以降の処理が止まっていた。

**変更**
- `startContinuousLoop` から該当行を削除

---

### v51 — 合図音が鳴らない不具合の修正

**症状**
区間の切り替え時（作業→休憩、休憩→作業）に合図音が鳴らない。ローカルサーバーでは鳴るが、GitHub Pages上では鳴らない。

**原因（推定）**
`playTone` は最初の呼び出し時に AudioContext を生成する。区間の切り替えはユーザー操作から離れたタイミングで起きるため、生成された AudioContext は `suspended` 状態になる。`ctx.resume()` は Promise を返す非同期処理だが、その完了を待たずに `osc.start(now + n.start)` へ進むため、指定時刻が過去になり音が出ない。ローカルでは処理が速く間に合っていた。

**変更**
- `ensureSoundContext()` を追加。AudioContext の生成と `resume()` を行う
- タイマー開始の4関数（`startLoopSet` / `startWorkOnly` / `startRestOnly` / `startContinuousLoop`）の先頭で呼び出し、ボタンのタップを起点に AudioContext を起こす

**残課題**
回線が細いときは依然として鳴らないことがある。合図音は音源ファイルを使わないため回線とは無関係のはずで、BGMの読み込み待ちが処理を圧迫している可能性がある（未検証）。

---

### v50 — 区間切り替えのギャップ時間が欠落

**症状**
区間の切り替えで、通知音とBGMのタイミングが重なる。

**原因**
`onSegmentComplete` 末尾の `setTimeout` で第2引数が空になっていた。`undefined` は待ち時間0として扱われるため、コメントに記された1秒のギャップが機能していなかった。構文エラーにならないため気づきにくい。

**変更**
- `setTimeout` の第2引数に `1000` を設定
- 昼・夜の `list.txt` に原曲名を追加

---

### v49 — 設定画面が開かない不具合の修正

**症状**
設定画面が開かない。選曲モーダルは開く。

**原因**
`renderCredits` が `musicTracks` の要素を文字列として扱っていた。v47で要素が `{ path, title }` のオブジェクトに変わったため、`fullPath.split('/')` で例外が発生。`openSettings` 内で `renderCredits()` の後に画面を開く処理があるため、そこに到達していなかった。

**変更**
- `renderCredits` の `map` を `track` で受け、`fullPath: track.path` / `title: track.title` を渡す形に変更
- `renderGroup` の表示を、ファイル名ではなく原曲名（`title`）に変更
- 自然音は `{ path, title }` 形式ではないため、`title` にラベルを設定

---

### v48 — クロスフェードの廃止

**症状**
プール方式導入後、iPhoneで再生が破綻。2曲が同時に鳴る、再生が止まる、アクセスした瞬間に再生が始まる、同じ曲がループする、自然音を鳴らすと停止中の曲が流れ始める。

**原因**
Audio要素を3つで使い回していたため、`poolIndex` が一周すると再生中またはフェード中の要素の `src` を上書きしていた。加えて、要素を使い回すと `newAudio === currentAudio` の判定が意図せず真になり、`onended` が誤発火していた。

Appleの公式ドキュメントに、iOSでは複数の音声ストリームの同時再生はサポートされないと明記されている。2026年時点でも同様との報告があり、クロスフェード自体がiOSでは原理的に成立しない。

**変更**
- クロスフェードを全環境で廃止（重要度が低いため、iOS判定による分岐は設けない）
- Audio要素を `bgmAudio` の1つに統一
- `lastRequestedSrc` を追加し、`ended` の判定を `src` の一致で行う（要素が1つでは `newAudio === currentAudio` が常に真になり判定として機能しないため）
- `stopMusic` で `onended = null` と `lastRequestedSrc = null` を実行（停止後の `ended` 発火による再生再開を防ぐ）
- `startCrossfade` の呼び出しを削除

**残課題**
- `startCrossfade` / `fadeMs` / `FADE_TICK_MS` / `clampVol` / `fadeTimer` が未使用のまま残存
- 曲の切り替わりに読み込み待ちの無音が発生する（要素が1つのため、`src` 差し替え後にダウンロードが完了するまで無音）

---

### v47 — 選曲モーダルとクレジット欄に原曲名を表示

**変更**
- `list.txt` を「ファイル名,原曲名」の2列形式に変更。カンマ以降が無い行はファイル名を原曲名として扱うため、段階的に移行できる
- `loadTrackList` の返り値を `{ path, title }` の配列に変更
- `normalizeTrackSelection` / `effectiveWorkList` / `effectiveRestList` の比較を `path` で行うよう修正
- `playPhaseTrack` で `track.path` を再生に使用。`dispNo` の照合を `findIndex` + `path` に変更
- `renderTrackSelect` の表示を原曲名に変更。`toggleWorkTrack` / `setRestTrack` / `selectAllWorkTracks` の引数と保存をパス文字列に統一

**設計判断**
`trackSelection` と localStorage はパスの文字列で保持する形を維持した。保存形式を変更すると既存ユーザーの選択が全て失われるため。

---

### 未着手

- **「すべて停止」後に曲順が続きから始まる**：`resetBgmState` の外に曲順を保持する変数がある。`playPhaseTrack` 周辺が未確認
- **曲の切り替わりの無音**：音源のビットレートを落とす、フェードアウトを戻す（iOSで `volume` が効くかは未検証）などの案
- **未使用関数の削除**：`startCrossfade` 他
- **自然音とBGMの同時再生**：iOSの制約に触れている可能性。挙動を要確認
- **回線が細いときに合図音が鳴らない**：原因未特定

---

### 作業メモ

- iPhoneでJSの更新が届かない場合、`?v=` はHTMLにしか効かない。`<script src="scriptBGM.js?v=51">` のようにJS側にも付ける
- 構文エラーが起きるとJS全体が実行されず、エラー表示も出ないまま「一部だけ動く」ように見える。設定画面が開かない、ログが出ないといった症状が出たら、まず構文エラーを疑う
- 画面下部にログを表示する仕掛けは `console.log` のみを拾う。`console.error` と `console.warn` は表示されないため、Macのコンソールで確認する

### v46 — iOSでの再生失敗に対応（Audio要素のプール化）
症状
* 4回目の再生で NotSupportedError
* 2曲目が鳴らないが、一時停止して再開すると鳴る
* iOSのコントロールセンターで再生バーが途中で先頭に戻る
原因（調査に基づく推定） iOS Safariはメディアファイルをキャッシュせず、new Audio() の生成ごとにファイルを再取得している可能性が指摘されている。playAudioFile は再生のたびに new Audio(file) を呼ぶ設計だったため、細い回線では取得が完了しないまま要素が積み上がり、上限に達して失敗したと考えられる。
変更
* Audio要素を3つ固定で持つプールを追加。src を差し替えて使い回す
* playAudioFile から new Audio(file) を削除し、takeAudio() に置換
* 要素の使い回しでリスナーが累積するため、addEventListener を onended / onerror のプロパティ代入に変更
* .catch にファイル名を追加（どの曲で失敗したか特定するため）

### v45 — 拡大表示でのはみ出し修正
症状 Androidの拡大表示モードで、朝昼夜の行が横方向にはみ出して切れる。自然音ボタンの行は正常。
原因 .phase-row に flex-wrap の指定がなく、デフォルトの nowrap のまま折り返さずに横へ伸びていた。さらに overflow: hidden がはみ出し部分を切り落としていたため、症状が「切れる」形で現れ、原因の特定を遅らせた。
変更
* .phase-row に flex-wrap: wrap を追加
* .phase-row の overflow: hidden を削除
* 折り返し後に朝の行のラベルとボタンが重なったため、margin-top で余白を確保
補足 朝の行のラベルは ::before の絶対配置（top: -1.05rem）でボタンの外側に出しており、レイアウト上の場所を占有しない。そのため padding-top では基準要素の内側に余白ができるだけで効かず、margin-top が必要だった。

### v44 — 音源ファイル名を半角英数化
経緯 NotSupportedError の原因として日本語ファイル名を検証。GitHub Pagesはファイル名をURLとして扱うため、Unicode正規化の差（macOSのNFDとJS内文字列のNFC）で不一致が起き、404を返す可能性がある。404で返るHTMLを音声として解析すると NotSupportedError になるため、症状と一致していた。
変更
* 音源ファイル名を半角英数に統一
* list.txt を併せて更新
結果 症状は解消せず。原因ではなかった。ただしファイル名の文字コード問題は環境依存で表面化しやすいため、予防措置として維持する。

### 未着手
* iOSの同時再生制約：Appleの公式ドキュメントに複数音声ストリームの同時再生は非対応と明記。2026年時点でも変わらないという報告あり。クロスフェード自体がiOSで成立しない可能性が高い。iOS判定で fadeMs() を0にして即時切り替えにする案
* 「すべて停止」後に曲順が続きから始まる：resetBgmState の外に曲順を保持する変数がある。playPhaseTrack 周辺が未確認。localStorageの可能性も
* 自然音とBGMの同時再生：同じ制約に触れている可能性。iPhoneでの挙動を要確認
* Web Audio APIへの移行：クロスフェードと音量制御の根本解決。規模大

### 環境メモ
* povoの使い放題トッピングでも、大量通信後は混雑時間帯に速度制限がかかる（規約に明記、閾値は非公表）
* iPhoneでJSの更新が届かない場合、?v= はHTMLにしか効かない。<script src="scriptBGM.js?v=46"> のようにJS側にも付ける

### コミットメッセージ:
git commit -m "v44: rename audio files to ascii / v45: fix phase row overflow / v46: reuse audio elements for iOS"

---
## v43

- 区間終了の `fadeSec` 秒前から前の曲だけを落とす（`startFadeOutOnly` 新設）。境界で無音にしてから遷移音を鳴らすため、音が重ならない。
- `playEndSound` を下降3音（A5→E5→A4）に変更。上昇のままだと `playToWorkSound` と終止音が同じで混同するため。
- `playAudioFile` / `playPhaseTrack` に `immediate` 引数を追加し、クロスフェードを経由しない即切り経路を新設。
- `onSegmentComplete` に `stopMusic()` を追加。区間跨ぎで前の曲を確実に停止する。
- 区間間のギャップを 1000ms → 400ms に短縮。

---

## v42

ループ回数を時間帯ごとに持つ（v31で共通化したものを再び分離）。人によって朝・昼・夜で自由に使える時間が違うので、朝1回・昼2回・夜4回のように個別に指定できる。値は localStorage に保存し、次回もそのまま使う。

---

## v41

**[AI]** 区間の切り替わりで合図音を鳴らすようにした。作業→休憩は下降音（A5→E5、緩む合図）、休憩→作業は上昇音（E5→A5、締める合図）。v40 までは全体の終了時にしか音が無く、ループ中の切り替わりが音では分からなかった。オシレーターで合成しているので音源ファイルは不要。設定の「タイマー終了音」オフで切り替え音も止まる。

**[AJ]** 制御ボタン（一時停止／全ループ／全て停止）の絵文字をSVGに置換。自然音アイコンと同じく `currentColor` 追従なので、ボタンの状態色に自動でついてくる。OS間で見た目が変わらないのも同じ理由。

**[AK]** 一時停止中の pause ボタンに `paused` クラスを付けるようにした。CSS 側でゴールド＋押し込まれた見た目にして、「今ここで止まっている」を示す。

---

## v40

**[AF]** 曲の手動選択を追加。時間帯ラベル（朝/昼/夜）をタップすると選曲モーダルが開く。作業曲は複数選択（チェックボックス、最低1曲）、休憩曲は単一選択（ラジオ、常に1曲）。

> 休憩曲を1曲固定にしているのは仕様であって未実装ではない。毎回同じ音が鳴ることで「この曲が鳴ったら休憩」という合図として機能させるため。作業曲＝複数／休憩曲＝単一という UI の非対称が、そのまま設計意図の表明になっている。

選択状態は localStorage に保存（キー: `bgmTimerTrackSelectionV1`）。list.txt が変わっても、消えたファイル名は起動時に自動で捨てられる。

**[AG]** v37 の `selectStartingTrack`（ラベルタップで開始曲のインデックスだけ進める）は廃止。開始曲を指定したい場合は選曲モーダルでその曲だけを選ぶ形になった。

**[AH]** 時間帯ラベル横の ♪ 表示を、停止中は「♪4曲」（選択中の曲数）、再生中は「♪3」（実際に鳴っている曲番号）に切り替えるよう変更。

---

## v39

**[AE]** 自然音に「風鈴」「雨」を追加（`NATURE_SOUNDS` 8種類に）。ファイルは `sound/n7_windchime.mp3`, `sound/n8_rain.mp3`。

---

## v38

**[AD]** 時間帯ラベルのタップが再生中の曲に割り込んでいたのを修正。（v40 で選曲モーダルに置き換えられ、この機構自体は廃止）

---

## v37

**[AC]** 自然音がBGMの操作のたびに止まっていたバグを修正。BGMだけをリセットする `resetBgmState` を新設し、`stopAllTimers`（「すべて停止」ボタン専用）だけが自然音も止めるように分離した。

---

## v36

**[AB]** 「25分」「5分」ボタンの表示文字を `SETTINGS.workMin` / `SETTINGS.restMin` と同期。

---

## v35

**[AA]** 曲データをJSの配列直書きから、フォルダ＋ `list.txt` の実行時読み込みに変更。

フォルダ構成:

```
morning/  morningrest/
noon/     noonrest/
night/    nightrest/
```

それぞれに `list.txt`（1行1ファイル名）を置く。

---

## v34

**[Z]** `Audio.loop = true` によるネイティブループ（フェード非対応）をやめ、`ended` で自然終了を検知して同じ曲を呼び直す方式に変更。

---

## v33

**[Y]** 1区間の時間を曲数で均等分割し、区間の中で複数の曲を順に流す方式に変更。

---

## v32 以前

| バージョン | 内容 |
|---|---|
| v32 | Nループの🔁トリガーボタンを廃止、起動は各行の「ループ」ボタンに一本化 |
| v31 | Nループの回数指定を全時間帯共通の1つの数字に変更 |
| v30 | 休憩曲を時間帯ごとの専用リストに。各行に「25分」「5分」「ループ」を新設 |
| v29 | `applySegmentMusic` の曲送り判定を `lastWorkPhase` 方式に修正 |
| v28 | BGM再生スピード設定、タイマー終了音、クロスフェードの複数トラック対応 |
| v27 | 設定モーダル実装（音量・時間・フェード、クレジット、localStorage） |
| v26 | 朝・夕方の整理、1ループ/Nループ制、`loopTarget` / `loopsDone` 導入 |
| v25 | `TARGET_VOLUME` 二重宣言解消、一時停止で音楽も停止、トグル停止対応 |
| v24 | 状態管理を単一オブジェクト `TM` に統合 |
| v23 | トラック切り替えのクロスフェード化 |
| v22 | サイクル間ギャップ中の一時停止／再開 |

## v22 以前

2025年9月〜2026年3月にかけて別系統の実装が存在した。
現行コードはそこからの作り直しであり、連続していない。