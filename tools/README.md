# tools

ヘッドレスブラウザ(Playwright の Chromium)でスタジオやステージを開き、撮影・見た目の比較・腕ポーズの自動調整を行う道具です。CDN から読み込む Three.js は `node_modules` のものに差し替えるので、オフラインでも動きます。

## 準備

```sh
cd tools
npm install
npx playwright install chromium   # 初回だけ。ブラウザを入れずに既存の Chrome を使うなら CHROME_PATH=/path/to/chrome を指定
```

## 撮影 `shoot.mjs`

```sh
node shoot.mjs shots/cyber-knight-baseline.json --out out/before
```

- 撮影リスト(`shots/*.json`)の各要素は `{ name, js, cam, target, wait }` です。
- `js` はページ内で実行するコードです。スタジオでは `__studio` から次のものが使えます。
  - `K`(ナイト)、`H`(バイク)、`G`(天馬)
  - `step(n)`: n フレームだけ進めます
- 撮影前に `__studio.prepare()` が呼ばれます。止めて状態をそろえるので、同じコードなら毎回同じ画像になります。
- オプション
  - `--page neon-stage.html`: 開くページ
  - `--size 1280x720`: 画面の大きさ
  - `--ui`: 操作パネルも写す

## 見た目の比較 `compare.mjs`

```sh
node compare.mjs out/before out/after          # 差の大きい画素の割合を表示(2% を超えると「要確認」)
```

差分画像を `out/after/diff/` に書き出します。終了コードは、すべて許容範囲なら 0、要確認があれば 3 です。

**変更が見た目を壊していないか確かめる手順**
1. 変更前に `shoot --out out/before` で撮る
2. 変更する
3. `shoot --out out/after` で撮る
4. `compare out/before out/after` で比べる

マントの布は、わずかな差でもしわの出方が変わります。差が布だけなら問題ありません。

## 腕ポーズの自動調整 `optimize-arms.mjs`

```sh
node optimize-arms.mjs targets/cyber-knight-arms.json            # 全ポーズ
node optimize-arms.mjs targets/cyber-knight-arms.json --pose guard --side L
```

持ち物(盾・剣など)の位置と向きが目標に近づくように、肩・肘・前腕ひねり・手首の角度を探します。結果は静止ポーズにそのまま貼れる形で表示し、`out/optimize-result.json` にも保存します。

目標ファイル(`targets/*.json`)で指定する項目は次のとおりです。座標はスタジオのワールド座標(メートル)です。

- `object`: 向きを測る物。モデルの公開 API からのパスで書きます(例: `items.L.obj.children.0` = 盾本体)
- `axis`: その物のローカル軸。この軸を `dir` の向きにそろえます
- `posObject`: 位置を `pos` に合わせる物。省略すると `object` と同じです
- `upAxis` / `upWeight`: その軸をなるべく上へ向けます
- `avoid`: 関節の近くに入り込まないための罰則です(盾が胸にめり込まないように、など)

体格や持ち物を変えたら、まずこれで腕の角度を出し直し、撮影して確かめるのが近道です。
