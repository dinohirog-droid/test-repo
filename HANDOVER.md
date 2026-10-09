# 引き継ぎ資料(HANDOVER)

Three.js で作った人型キャラ・乗り物・ステージ・編集ツールの全体像と、作業を続けるための約束ごとをまとめます。使い方の詳細は `README.md` と `tools/README.md` にあります。この資料はその地図です。

## 1. 全体像

```
humanoid-core.js ──(共通基盤)── cyber-knight-model.js   サイバーナイト
                              └─ kunoichi-model.js       くノ一
cyber-horse-model.js(バイク)/ cyber-steed-model.js(天馬)  … 人型が乗れる乗り物

index.html        スタジオ(全キャラ・乗り物の確認、?char=kunoichi)
pose-editor.html  ポーズ編集(関節・指・腕 IK・キーフレーム → コード書き出し)
neon-stage.html   ネオン街をバイクで走るステージ
examples/r128.html  three r128 への組み込み例
tools/            撮影・画像比較・腕ポーズ最適化・モード総当たり検査(Node + Playwright)
```

- すべてコードで形を作っており、3D モデルファイルや画像素材は使いません(布の柄や目の絵もキャンバスに描画)。
- モジュールの約束: `window.XxxModel = { info, create(THREE, parent, options) }`(ユーザーのセリナ `robot-model.js`、LUNA `bike-model.js` と同じ形)。
- three r128〜r170 で動きます。縮尺の既定は 2.4(セリナの世界に合わせる)。スタジオは `1/2.4` の group に入れてメートル表示。
- HTML はファイルを直接開いても動きます(`file://`)。そのためスタジオのコードは HTML 内のモジュールに直書きしています。

## 2. 共通基盤 `humanoid-core.js`

キャラのファイルは「定義(spec)」を渡すだけで、骨格・動き・物理は共通基盤が受け持ちます。**ここを直すと全キャラに効く**ので、直したら必ず 6 章の検査を流します。

| 受け持つもの | 中身 |
| --- | --- |
| 骨格 | 関節表 `[名前, 親, 位置, 可動域(度), 表示名]`。左を書けば右は鏡像で自動生成。関節マーカー |
| 手 | 指 3 節 × 4 + 親指。形は `{ c, th, sp }`(簡易)か `{ f, spr, t }`(各節・指ごとの開き・親指の向かい合わせ/ひねり)。型: grip/fist/open/relax/pinch/scissor/point/sword/chop。持ち方の点: `grip`/`gap`(人差し指と中指の間)/`pinch` |
| ポーズ | 静止ポーズ `{ root, yaw, flip, j, feet, hand }`、補間 `blendPose`、キーフレーム `seq`、モード(関数)とアクション(`{dur, next}`) |
| IK | 脚: 2 ボーン解析 IK(足の位置・向き・つま先・膝の開き)。腕: 目標オブジェクトへ(X = 握る棒の向き、Y = 手の甲の向き、`userData.handPoint`) |
| 動き | 歩き・走り(立脚/遊脚の歩行。`spec.walk/run` で調整)、跳躍(`spec.jump`)、宙返り `flip`、空いた腕の自然な形(`spec.freeArm`) |
| 物理 | マント(Verlet 布)、毛の束(羽飾り・髪。球コライダーあり)、武器の軌跡 |
| 見た目 | 輪郭線(裏面を太らせる方式)、発光の点滅、色替え、刀身のしなり `U.makeBender`、髪の房 `U.hairLock` |
| 顔 | `spec.face`: アニメ調の目(表情 7 種・まばたき・瞳の模様・画像差し替え)。`face.full` で素顔全体の絵(眉・頬・鼻・口・口パク) |
| 乗車 | 乗り物の `seatMarker / gripTarget / pegMark / chassis / riderStyle / riderColliders` |

spec の項目一覧は `humanoid-core.js` の `global.HumanoidCore = {` の直後のコメントにあります。キャラ固有の処理は `materials / build / poses / modes(h) / actions / linked / colors / applyColor / update / api` に書きます。`modes(h)` の `h` には `fromStatic, seq, addJ, gait, freeArm, air, squat, mood, win, bump, blendHand, ctx` などの道具が入っています。

## 3. キャラクター

### サイバーナイト `cyber-knight-model.js`
盾は拳で裏の取っ手を握る方式(間隔調整あり)。バイザー関節、羽飾り、紋章入りの前垂れ、カラバリ 5 色(通常/レッド/漆黒/ブラッドレッド/ゴールド)。技: 回転斬り・突進・跳躍(低め・宙返りなし)。

### くノ一 `kunoichi-model.js`
- 6.5 頭身・156cm。フード+マスクで目だけ見える。`setHood(false)` / `setMask(false)` で素顔・髪(ふんわりした房 + 頭頂からつながる前髪 + 高めのポニーテール)。
- 刀(両手持ちは左腕 IK)、鞘・短刀・クナイ、破れ裾のマント、カラバリ 4 色(紅/藍/緑/紫。瞳の色も変わる)。
- 技: 跳躍(前宙)・空中攻撃・斬撃・手裏剣(3 枚を飛び道具として投げる)・隠密(しのび足)・**流れ星**(左手の指で切っ先を挟み、刀身を弓なりにしならせて溜め、離して横一閃)。
- 流れ星の構え `ryuseiSet` はユーザーがポーズ編集で作ったもの。振り終わり `ryuseiCut` は「右肩のひねり・前後と右肘だけ動かす」条件で探索して決めた。ユーザーは「ほぼ再現できた」と評価済み。今後改善の余地として残す。

### 乗り物
- サイバーホース(バイク): 兜顔のカウル、エネルギーホイール、マフラー炎、ハンドル・傾き・ブースト。
- 天馬(装甲ペガサス): 3 関節の翼、たてがみ・尾の物理、歩く・駆ける・後ろ脚立ち・飛ぶ。

## 4. ページ

- `index.html`: キャラ切り替え(`?char=kunoichi`)、モード・技、表情、フード/マスク、カラバリ、乗り物、関節エディタ、輪郭線、物理などの切り替え。`window.__studio` から撮影ツールが操作する。
- `pose-editor.html`: 関節(マーカーをクリック。重なりは連続クリックで切替)、足のドラッグ、腕 IK(ドラッグ目標 → 焼き込み)、指の全節、キーフレーム再生、静止ポーズ/技のコード書き出し、保存、元に戻す、4 分割表示、参考画像の重ね表示。**書き出したコードはキャラのファイルの POSES / modes / actions にそのまま貼れる**。
  - 注意: ファイルを直接開くとクリップボードが使えないことがある。コピー失敗時は通知が出るので、書き出し欄から Ctrl+C。
- `neon-stage.html`: ネオン街を走るゲーム風ステージ(チャンク再利用・雨・ブースト・カメラ 3 種・タッチ操作)。

## 5. ツール(`tools/`)

```sh
cd tools && npm install          # playwright 1.56.1 / three 0.170 / three128(0.128)
node shoot.mjs shots/kunoichi-look.json --out out/after     # 撮影(focus で部位にカメラを向けられる)
node compare.mjs out/before out/after                       # 画像比較(2% 超で要確認、終了コード 3)
node check-modes.mjs 'index.html?char=kunoichi'             # 全モードの組み合わせ検査
node optimize-arms.mjs targets/kunoichi-arms.json --pose guard   # 持ち物の位置・向きから腕の角度を探す
```

- CDN の three は `node_modules` に差し替えるのでオフラインで動く。
- `tools/out/` は git に入れない(`.gitignore`)。基準画像はセッションごとに撮り直す必要がある。

## 6. 変更するときの手順(重要)

1. 変更前に基準を撮る: `shoot shots/cyber-knight-baseline.json --out out/check` と `shoot shots/kunoichi-look.json --out out/kb`
2. 変更する
3. 撮り直して `compare`。差が布・髪の揺れだけなら問題なし。意図した変更なら基準を更新する
4. `check-modes.mjs` を両キャラで流す(前のモードの設定の持ち越しなどを検出)
5. ページがエラーなく開くか確認(一度 `C is not defined` でページが真っ黒になったことがある。撮影ツールは画像が出てしまうので、エラーの有無は別に確認する)

腕の角度は手で探さず `optimize-arms.mjs` かポーズ編集で決めるのが速い。関節角度の補間だけで速い振りを作ると刃先の軌道が波打つので、軌道が大事な技は「振る関節を絞る」か「腕 IK で軌道に沿わせる」。

## 7. 作業の経緯と方針(ユーザーとの合意)

- 外観の質と関節・可動部の機能を両立させる。ユーザーのセリナ(`robot-model.js`)と同等以上が目標。
- 「デッサン人形を先に作る」案は二度手間なので見送り。**キャラを作りながら共通基盤を育てる**やり方で進める。直した改善は全キャラに届き、確認は 6 章のツールで機械化する。
- 見た目の相談は画像を添えて行う。ユーザーは参考画像(設定資料シート)を渡してくれることが多い。画像は遠近感を考えて読む。
- コミットはブランチ `claude/clever-meitner-v1gurd` に push。PR は頼まれたときだけ。

## 8. 残っている課題・案

- 流れ星: 振り終わりのポーズを、ポーズ編集で作ったもので置き換えると更に良くなる可能性。
- くノ一の素顔: 前髪の束のまとまり、ポニーテールがマントと同系色で沈む点、頭頂の分け目、結び目をリボンにする案。
- 顔パーツの画像差し替え: 高解像度の透過 PNG(虹彩 256px 以上)があれば `setEyeImages` で使える。参考シート(1125px 幅)は解像度不足。
- 他の刀の技(斬撃・空中攻撃)も、軌道を重視するなら流れ星と同じ考え方で作り直せる。
- 新しい人型を作るときは `kunoichi-model.js` が最新の実例(顔・髪・手の型・しなる武器・飛び道具を含む)。
