# Cyber Knight

Three.js で作ったサイバーナイトの可動モデルです。形はすべてコードで生成していて、外部の 3D モデルファイルは使っていません。

モデル本体は `cyber-knight-model.js`、専用バイク「サイバーホース」は `cyber-horse-model.js` です。セリナ(`robot-model.js`)や LUNA(`bike-model.js`)と同じく、`info` と `create(THREE, parent, options)` を持つモジュールとして `window.CyberKnightModel` / `window.CyberHorseModel` に登録されます。three r128 〜 r170 で動きます。

## 動かし方

`index.html` をブラウザで開くとスタジオが表示されます(ファイルを直接開いても、ローカルサーバー経由でも動きます)。Three.js は CDN から読み込むので、インターネット接続が必要です。

- `index.html`: スタジオ(r170・ブルーム・操作パネル)
- `examples/r128.html`: r128 への組み込み例(モーションを巡回し、最後にバイクで走る)

## 組み込み方

```html
<script src="three.min.js"></script>
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
| `color` | `'normal'` | `normal` / `red` / `black` / `gold` |
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
| `ride(bike)` / `dismount()` / `isRiding()` | バイクに乗る / 降りる。`seatMarker`・`gripTarget[±1]`・`pegMark{L,R}`・`chassis` を持つバイク(サイバーホース、LUNA)に対応 |
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

## 機能

- **関節リグ**: 腰・背骨・胸・首・頭・バイザー・肩・肘・前腕ひねり・手首・股関節・膝・足首・つま先。各関節に可動域があり、角度はその範囲に収まるよう制限されます。肘と膝は曲げのみのヒンジで、ひねりは前腕の関節が受け持ちます
- **手**: 4 本の指は 3 節、親指も 3 節。曲げ・親指・開きのパラメータで、持ち手 / 握り手 / 開き手 / 自然 を切り替えられます
- **盾の保持**: 裏面の縦の取っ手を左手の拳で握ります。盾の向きは手首で決まり、拳との間隔は調整できます
- **脚 IK**: 2 ボーンの解析 IK で足を接地させます。腰を下げると膝が曲がり、つま先立ちではつま先関節が地面に沿います。足が移動するポーズでは自動でステップが入ります
- **連動パーツ**: 肩アーマーは腕に、草摺と前垂れ・後ろ垂れは太ももに、一部だけ追従します
- **カメラ目線**: 首 35% / 頭 65% に分けて振り向きます
- **物理**: マントは Verlet 法の布(体との衝突あり、背中側に留まる制約つき)、羽飾りは形を保とうとするバネ付きの鎖。物理は縮尺に依存しない空間で計算します
- **輪郭線**: 背面を法線方向に太らせて描く方式。パーツごとに線が出ます
- **剣の軌跡**: 直近 0.22 秒の刃の位置からリボンを描きます(フレームレートに依存しません)

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `cyber-knight-model.js` | モデル本体(形状・リグ・IK・モーション・物理・API) |
| `cyber-horse-model.js` | 専用バイク サイバーホース |
| `index.html` | スタジオ(r170、ブルーム、操作パネル、関節エディタ) |
| `examples/r128.html` | r128 への組み込み例(モーション巡回 + 乗車) |
