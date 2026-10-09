# Cyber Knight

Three.js で作ったサイバーナイトの可動モデルです。形はすべてコードで生成していて、外部の 3D モデルファイルは使っていません。

人型の共通基盤は `humanoid-core.js`、サイバーナイトは `cyber-knight-model.js`、専用バイク「サイバーホース」は `cyber-horse-model.js`、愛馬「天馬(装甲ペガサス)」は `cyber-steed-model.js`、くノ一は `kunoichi-model.js` です。セリナ(`robot-model.js`)や LUNA(`bike-model.js`)と同じく、`info` と `create(THREE, parent, options)` を持つモジュールとして `window.CyberKnightModel` / `window.CyberHorseModel` / `window.CyberSteedModel` に登録されます。three r128 〜 r170 で動きます。

## 動かし方

`index.html` をブラウザで開くとスタジオが表示されます(ファイルを直接開いても、ローカルサーバー経由でも動きます)。Three.js は CDN から読み込むので、インターネット接続が必要です。

- `index.html`: スタジオ(r170・ブルーム・操作パネル)
- `examples/r128.html`: r128 への組み込み例(モーションを巡回し、最後にバイクで走り、天馬で飛ぶ)

## ネオン街ステージ(`neon-stage.html`)

サイバーナイトがサイバーホースでネオン街を走るステージです。ファイルを直接開けば遊べます。

- 終わりなく続くビル街(窓明かり・ネオン管・看板・街灯・ゲート)、濡れた路面、雨
- 操作: ← → / A D で左右、↑ ↓ / W S で加速・減速、SPACE でリアスラスターのブースト(ゲージ制)。スマホはタッチボタン
- 一般車(ホバーカー)をよけて走り、距離を伸ばす。ぶつかると減速。最高記録はブラウザに保存
- カメラは追走 / 横 / 低め の 3 種類。雨のオン/オフ

## 組み込み方

```html
<script src="three.min.js"></script>
<script src="humanoid-core.js"></script>      <!-- 先に読み込む -->
<script src="cyber-knight-model.js"></script>
<script>
  const knight = CyberKnightModel.create(THREE, scene, { scale: 2.4 });
  knight.setMode('walk');
  // 毎フレーム
  knight.update(dt, t, camera);
</script>
```

- 金属の鎧は周囲を映して色が出るため、`scene.environment` に環境マップを設定してください(例は `examples/r128.html`)
- 発光パーツは自己発光(emissive)です。ブルームを使わない場面では `glowIntensity: 0.35` 程度に下げると落ち着きます

### options

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `scale` | `2.4` | 縮尺。既定はセリナ(全高 約 4.7)と同じ世界。`1` でメートル単位(全高 1.97) |
| `color` | `'normal'` | `normal`(通常) / `red`(レッド) / `black`(漆黒) / `bloodred`(ブラッドレッド) / `gold`(ゴールド)。甲冑の地金・金縁・発光色・塗装・マント・羽根がまとめて変わる |
| `mode` | `'idle'` | 開始時のモーション |
| `outline` / `outlineWidth` | `true` / `0.005` | 輪郭線 |
| `ik` / `physics` / `look` | `true` | 脚 IK / マントと羽飾りの物理 / カメラ目線 |
| `glowPulse` | `true` | 発光パーツのゆっくりした点滅 |
| `sword` / `shield` | `true` | 武装 |
| `shieldClearance` | `0.055` | 盾の裏面から取っ手までの距離(m) |
| `glowIntensity` | `1` | 発光の強さの倍率 |

### 主な API

| メソッド | 内容 |
| --- | --- |
| `update(dt, t, camera)` | 毎フレーム呼ぶ。モーション・IK・連動パーツ・物理・目線を更新 |
| `setMode(name)` | `idle` `guard` `block` `visor` `walk` `run`(ループ)、`spin` `charge`(アクション。終わると `guard` に戻る) |
| `setColor(id)` | カラーバリエーション |
| `setHand(side, preset)` | 手首パーツの差し替え。`'L'`/`'R'` に `fist`(握り手)・`open`(開き手)・`relax`、`null` で持ち手。握り手以外にすると、その手の武器は外れる |
| `setEquip({ sword, shield })` | 武装の着脱 |
| `setShieldClearance(m)` | 盾と拳の間隔 |
| `setOutline(on, width)` | 輪郭線 |
| `setIK(on)` / `setPhysics(on)` / `setLook(on)` / `setGlowPulse(on)` | 各機能の切り替え |
| `editJoint(name, axis, deg)` / `editRoot(axis, m)` | 関節エディタ用。その時点のポーズを保持して編集する(`hold` モード) |
| `getPose()` / `setExternalPose(P)` / `applyPose(P)` | ポーズの取得と外部からの駆動(乗車など) |
| `resetPhysics()` | マントと羽飾りを今の姿勢で落ち着かせる |
| `ride(vehicle)` / `dismount()` / `isRiding()` | 乗り物に乗る / 降りる。`seatMarker`・`gripTarget[±1]`・`pegMark{L,R}`・`chassis` を持つ乗り物(LUNA と同じ形式の目印)に乗る。`riderStyle`(姿勢・膝の開き)と `riderColliders`(マントの当たり判定)があれば使う。動作確認はサイバーホースと天馬 |
| `setWind(v)` | 走行風。マントと羽飾りが後ろへなびく |

公開プロパティ: `root`、`joints`(関節名 → Object3D)、`JOINTS`(可動域つきの関節一覧)、`CH`(UI 用チャンネル一覧)、`hands.L/R.grip`(握り点)、`sword`、`shield`、`markers`、`materials`、`poses`。

## サイバーホース(`cyber-horse-model.js`)

設定資料の専用重装バイクです。縮尺は LUNA と同じ(セリナの世界)。

- 兜の面当てを模したフロントカウル(縦スリット + 金の稜線)と、青いドームの十字エンブレム
- 金のトレリスフレーム、露出したエンジン、倒立フォーク、モノショック
- エナジーホイール(渦の発光 + トレッドの発光ライン)
- 右側のツインマフラー兼リアスラスター(噴射炎)、テールの左右スラスターとテールランプ
- メーター、スクリーン、サイドスタンド
- 乗り手の目印 `seatMarker`・`gripTarget[1](左) / [-1](右)`・`pegMark.L / R`

```js
const horse = CyberHorseModel.create(THREE, scene);
knight.ride(horse);            // 座席に座り、手はグリップ、足はステップへ(腕と脚の IK)
horse.update(dt, speed);       // ホイールの回転・メーター
horse.setSteer(rad);           // ハンドル(握った手も追従)
horse.setLean(rad);            // 車体の傾き(乗り手ごと傾く)
horse.setBoost(0..1);          // スラスター噴射
knight.setWind(speed * 0.25);  // マントが後ろへなびく
```

## 天馬(`cyber-steed-model.js`)

設定資料の装甲ペガサスです。縮尺はサイバーナイトと同じ(既定 2.4)。

- 白い馬体(断面をなめらかにつないだ胴・首・頭)、面甲(チャンフロン)・頬当て・首甲・胸甲・肩の板・脚甲・蹄の金縁
- 鞍、紋章(金の十字)入りの馬衣。前後の馬衣は脚の動きに追従
- 翼: 肩・肘・手首の 3 関節と、初列・次列・三列風切と雨覆の羽根。白から先端へ色づく。たたむ / 広げる / 羽ばたく
- たてがみ・前髪・頭の羽飾り・尾は揺れる物理つき。手綱はハミから乗り手の手元へ
- 動き: `idle`(待機) / `walk`(歩く) / `gallop`(駆ける) / `rear`(いななき) / `fly`(飛翔)
- 表情: `setExpr('normal' | 'joy' | 'surprise' | 'angry')`(耳・目・頭の角度)

```js
const steed = CyberSteedModel.create(THREE, scene);
knight.ride(steed);            // 鞍に座り、手綱を握り、膝を開いて鐙に足を掛ける
steed.setMode('fly');          // 飛翔
steed.setWings('spread');      // 'spread' | 'fold' | null(モーション任せ)
steed.update(dt, t);
knight.setWind(steed.getSpeed() * 0.6);
```

## くノ一(`kunoichi-model.js`)

共通基盤で作った 2 体目の人型です。6.5 頭身(身長約 1.56 m)で、フードとマスクから大きな目だけが見えます。スタジオでは `index.html?char=kunoichi`(または上部のキャラ切り替えボタン)で表示します。

- 武器: 刀(右手。構えでは左手も腕 IK で柄を握る)、左腰に鞘、背中に短刀、右太ももにクナイ
- 目: キャンバスに描いたアニメ調の目(ステンドグラス風の虹彩・縦長の瞳孔・重ねた光・目尻ほど太いまつげ)。表情は 通常 / 驚き / 怒り / 笑い / 悲しみ、まばたきつき。瞳の模様は 通常 / 星空 / 魔法陣
- 目の画像差し替え: `setEyeImages({ iris: 'iris.png' })` で虹彩だけ画像にできます(まぶた・表情・まばたきは描画のまま)。色ごとに `{ crimson: …, indigo: … }`、表情ごとに両目まるごと `full: { normal: …, smile: …, closed: … }`(512:232)も指定できます。透過 PNG・虹彩 256px 以上を推奨します
- マント: 裾がほつれた布(背中に家紋)
- カラバリ: 紅 / 藍 / 緑 / 紫(目の色も変わります)
- モーション: 待機・構え・隠密(低い姿勢のしのび足)・歩く・走る
- 技: 跳躍(しゃがんで踏み切り、膝を抱えて前宙、着地で衝撃を吸収)・空中攻撃(跳んで振りかぶり、落ちながら斬り下ろす)・斬撃(上段から踏み込んで斬る)・手裏剣(左手の横投げで 3 枚を扇状に放つ。飛ぶ手裏剣はキャラの親に置かれ、1.1 秒で消えます)。流れ星(切っ先を左手の人差し指と中指で挟み、刀身を弓なりにしならせて溜め、離した瞬間に横薙ぎの一閃。刀は離すと逆へ弾けて震えながら真っすぐに戻ります)。技の間は自動で怒り目になります

```js
const kunoichi = KunoichiModel.create(THREE, scene, { scale: 2.4 });
kunoichi.setMode('guard');      // 'idle' | 'guard' | 'stealth' | 'walk' | 'run' | 技: 'jump' | 'airAttack' | 'slash' | 'shuriken' | 'ryusei'
kunoichi.setExpr('smile');      // 'normal' | 'surprise' | 'angry' | 'smile' | 'sad'
kunoichi.setColor('indigo');    // 'crimson' | 'indigo' | 'green' | 'purple'
kunoichi.setIrisStyle('magic'); // 'normal' | 'sparkle' | 'magic'
kunoichi.update(dt, t, camera);
```

## 人型の共通基盤(`humanoid-core.js`)と新しいキャラの作り方

キャラクターに依存しない仕組みは `humanoid-core.js` にまとまっています。キャラのファイルは「定義(spec)」を渡すだけです。

- 共通基盤が受け持つもの: 関節表から作る骨格(可動域・関節マーカー)、3 節の指の手と握り点、ポーズ補間・キーフレーム・歩く・走る・乗車・手動編集、脚 IK・腕 IK、カメラ目線、マント、毛の束(羽飾り・髪など)、武器の軌跡、輪郭線、発光の点滅、色替えの土台、乗り物への乗り降り、アニメ調の目(`face: true`。表情・まばたき・技の間の表情・瞳の模様・画像差し替え)、跳躍(`jump: { height, flip, tuck }`。`false` で無効)、手袋の手(`handStyle`)
- キャラのファイルが書くもの: 追加の関節、甲冑や体の形状、持ち物、静止ポーズ、技、連動パーツ、カラーバリエーション

新しい人型キャラは、次のように作れます(`cyber-knight-model.js` が実例です)。

```js
const SPEC = {
  name: 'BlackKnight',
  joints: { extra: [/* 追加の関節。省略すると標準の人型 */] },
  poses: { idle: { root: [0, 0, 0], j: { /* 関節名: [x, y, z](度) */ }, feet: { L: [0.15, 0, 10], R: [-0.15, 0, -10] } } },
  build(ctx) {
    const { U, M, J } = ctx;          // U: 形状ヘルパー(lathe・shell・band・extrude…) / M: 標準マテリアル / J: 関節
    U.add(J.chest, U.lathe([[0.15, -0.05], [0.22, 0.12], [0.12, 0.34]]), M.steel);
    ctx.items.R = { name: 'sword', obj: mySword, trail: { base, tip } };  // 右手の握り点 ctx.hands.R.grip に付ける
    ctx.strands.push({ anchor: 'head', points: [/* [x,y,z] … */], width: 0.03 });
    ctx.colliders.push({ obj: J.chest, c: [0, 0.12, 0], r: 0.2 });       // マントの当たり判定
  },
  modes: (h) => ({ guard: (P, t) => { h.fromStatic(P, 'guard'); h.breathe(P, t, 0.6); } }),
  colors: { normal: { label: '通常', steel: 0x2b2e35, trim: 0xb08a45, glow: 0xff2a3a } },
};
const blackKnight = HumanoidCore.create(THREE, scene, {}, SPEC);
```

共通基盤のヘルパー(`modes(h)` の `h`)には `gait`(歩行の仕組み。`WALK` / `RUN` を元に速さ・歩幅・腰の低さを変えて使える)、`freeArm`、`seq` などがあります。ポーズの `flip`(度)で腰を中心に前へ回ります(宙返り)。`U.makeBender(group, meshes, start, len, axis)` で刀身などを弓なりにしならせられます(axis: `z` = 平らな面の向き(既定)、`x` = 刃の向き。輪郭線も一緒に曲がります)。

手足の長さを変えたいときは `joints.base` / `joints.side`(関節表)を書き換えます。IK は骨の長さを関節の位置から読むので、そのまま動きます。腕の静止ポーズは `tools/optimize-arms.mjs` で出し直せます。

## ポーズ編集(`pose-editor.html`)

関節・指・腕 IK・キーフレームを使ってポーズや技を作る専用ページです(`pose-editor.html?char=kunoichi` でくのいち)。

- **関節**: 関節マーカーをクリック(重なっているときは続けてクリックで切り替え)か一覧で選び、可動域の範囲でスライダーを動かします。左右の反転コピーもできます
- **足**: 脚 IK が有効なときは、足の球(緑)をドラッグして置きます。向き・つま先・膝の開きはスライダーで
- **腕 IK**: 手を「ドラッグ目標」(水色の球。W/E で移動・回転)や、キャラが持つ目標(`katanaGrip` など)へ伸ばします。持つ点は 手のひら / 人差し指と中指の間 / 親指と人差し指の先 から選べます。「腕の角度に焼き込む」で IK の結果を関節の角度にします(可動域を超えた関節は収めて知らせます)
- **手・指**: 型を選んでから、各指の 3 節・開き、親指の向かい合わせ・ひねり・曲げを調整します
- **キーフレーム**: 時刻ごとにポーズを置いて再生します(足が動くと自動で持ち上げます)
- **書き出し**: 静止ポーズをキャラのファイルの `POSES` に、技を `seq` とアクションの形で、そのまま貼れるコードにします。ブラウザへの保存・JSON ファイルの保存と読み込み、元に戻す(Ctrl+Z)/ やり直す(Ctrl+Y)も使えます
- **見る道具**: 4 分割(自由視点 + 正面・横・真上)、参考画像を半透明で重ねる(ドラッグ&ドロップ。画像はブラウザの中だけで使います)

## 道具(`tools/`)

撮影・見た目の比較・腕ポーズの自動調整のスクリプトです。使い方は `tools/README.md` にあります。変更前後を撮って比べれば、見た目を壊していないか機械的に確かめられます。

## 機能

- **関節リグ**: 腰・背骨・胸・首・頭・バイザー・肩・肘・前腕ひねり・手首・股関節・膝・足首・つま先。各関節に可動域があり、角度はその範囲に収まるよう制限されます。肘と膝は曲げのみのヒンジで、ひねりは前腕の関節が受け持ちます
- **手**: 4 本の指は 3 節、親指も 3 節。指ごとに 3 節を別々に曲げ、指ごとに開き、親指は向かい合わせ・ひねりも付けられます(`{ f, spr, t }`。従来の `{ c, th, sp }` もそのまま使えます)。型は 持ち手 / 握り手 / 開き手 / 自然 / つまむ / 指で挟む / 指さし / 剣指 / 手刀。`setHandPose(side, 型名か形)` で直接指定、`getHandPose(side)` で今の形を取得できます
- **持ち方の点**: 手には `grip`(手のひらで握る)に加えて `gap`(人差し指と中指の間)、`pinch`(親指と人差し指の先の間)があり、腕 IK の目標に `userData.handPoint = 'gap'` などと書くとその点を目標へ合わせます
- **盾の保持**: 裏面の縦の取っ手を左手の拳で握ります。盾の向きは手首で決まり、拳との間隔は調整できます
- **歩き・走り**: 片脚の周期を立脚と遊脚に分け、かかとから着地してつま先で蹴り出します。腰は上下・左右に揺れ、骨盤は脚と、肩と腕は逆向きにひねって振ります。歩幅や腰の高さは脚の長さから自動で決まり、`spec.walk` / `spec.run` で調整できます
- **空いた手**: 持ち物を外したり手を開いたりすると、その腕は自然に下ろした形(手のひらが太もも側)へ滑らかに移ります(`spec.freeArm` で変更可)
- **脚 IK**: 2 ボーンの解析 IK で足を接地させます。腰を下げると膝が曲がり、つま先立ちではつま先関節が地面に沿います。足が移動するポーズでは自動でステップが入ります
- **連動パーツ**: 肩アーマーは腕に、草摺と前垂れ・後ろ垂れは太ももに、一部だけ追従します
- **カメラ目線**: 首 35% / 頭 65% に分けて振り向きます
- **物理**: マントは Verlet 法の布(体との衝突あり、背中側に留まる制約つき)、羽飾りは形を保とうとするバネ付きの鎖。物理は縮尺に依存しない空間で計算します
- **輪郭線**: 背面を法線方向に太らせて描く方式。パーツごとに線が出ます
- **剣の軌跡**: 直近 0.22 秒の刃の位置からリボンを描きます(フレームレートに依存しません)

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `humanoid-core.js` | 人型の共通基盤(骨格・手・IK・ポーズ・物理・輪郭線・乗車) |
| `cyber-knight-model.js` | サイバーナイトの定義(関節・甲冑・武装・ポーズ・技・カラバリ) |
| `cyber-horse-model.js` | 専用バイク サイバーホース |
| `cyber-steed-model.js` | 愛馬 天馬(装甲ペガサス) |
| `kunoichi-model.js` | くノ一の定義(フード・マスク・目の表情・刀・カラバリ) |
| `index.html` | スタジオ(r170、ブルーム、操作パネル、関節エディタ) |
| `pose-editor.html` | ポーズ編集(関節・指・腕 IK・キーフレーム・書き出し) |
| `examples/r128.html` | r128 への組み込み例(モーション巡回 + バイク + 天馬) |
| `neon-stage.html` | ネオン街を走るステージ |
| `tools/` | 撮影・比較・腕ポーズ自動調整 |
