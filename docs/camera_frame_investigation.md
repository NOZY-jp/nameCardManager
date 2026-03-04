# カメラ撮影UI 枠の初期配置 調査レポート

## 1. 概要

カメラ撮影UIにおいて、CornerSelector（四隅選択）の枠初期配置がカメラUIの明るい部分（ガイドフレーム）と一致していない問題を調査した。

**結論**: CameraCapture のガイドフレームと CornerSelector のデフォルト四隅は**完全に独立して計算**されており、両者の間にデータの受け渡しがない。カメラガイドの明るい部分（名刺配置エリア）に合わせてユーザーが撮影しても、CornerSelector の四隅は画像全体の端に近い位置にデフォルト配置される。

## 2. 関連ファイル一覧

| ファイル | 役割 |
|---|---|
| `frontend/src/components/camera/CameraCapture.tsx` | カメラプレビュー + ガイドオーバーレイ |
| `frontend/src/components/camera/CameraCapture.module.scss` | ガイドフレームのスタイル（明るい/暗い部分の定義） |
| `frontend/src/components/camera/CornerSelector.tsx` | 撮影後の四隅選択UI |
| `frontend/src/components/camera/CornerSelector.module.scss` | 四隅選択UIのスタイル |
| `frontend/src/components/camera/CameraOCRFlow.tsx` | カメラ → 四隅選択 → OCR のフロー制御 |
| `frontend/src/components/camera/ImageUploadOCR.tsx` | 画像アップロード → 四隅選択 → OCR のフロー制御 |

## 3. CameraCapture UI の明るい/暗い部分の構造

### HTML構造 (CameraCapture.tsx L131-143)

```tsx
<section className={styles.guideOverlay} data-testid="camera-guide">
  <div className={styles.guideFrame}>
    <span className={`${styles.corner} ${styles.cornerTL}`} />
    <span className={`${styles.corner} ${styles.cornerTR}`} />
    <span className={`${styles.corner} ${styles.cornerBL}`} />
    <span className={`${styles.corner} ${styles.cornerBR}`} />
  </div>
  <p className={styles.guideText}>名刺を枠内に合わせてください</p>
</section>
```

### CSS構造 (CameraCapture.module.scss)

**明るい部分 = `.guideFrame`**（名刺を配置すべきエリア）:
```scss
.guideFrame {
  position: relative;
  width: min(80vw, 480px);          // ビューポート幅の80%、最大480px
  aspect-ratio: 1.75 / 1;           // 名刺比率 1.75:1
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: $radius-lg;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);  // ★ 外側を暗くする
}
```

**暗い部分** = `box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45)` により、ガイドフレーム外部全体が半透明の黒でカバーされる。

**ガイドオーバーレイ**:
```scss
.guideOverlay {
  position: absolute;
  inset: 0;                   // ビデオプレビュー全体にオーバーレイ
  display: flex;
  flex-direction: column;
  align-items: center;        // ★ ガイドフレームは水平中央
  justify-content: center;    // ★ ガイドフレームは垂直中央
  pointer-events: none;
}
```

つまり:
- **明るい部分**: 画面中央に配置された `min(80vw, 480px)` × `(min(80vw, 480px) / 1.75)` のエリア
- **暗い部分**: それ以外の全領域

## 4. CornerSelector の枠初期位置ロジック

### getDefaultCorners 関数 (CornerSelector.tsx L26-34)

```tsx
function getDefaultCorners(width: number, height: number): CornerPoint[] {
  const pad = 0.05;  // 画像端から5%のパディング
  return [
    { x: width * pad, y: height * pad },             // topLeft
    { x: width * (1 - pad), y: height * pad },       // topRight
    { x: width * (1 - pad), y: height * (1 - pad) }, // bottomRight
    { x: width * pad, y: height * (1 - pad) },       // bottomLeft
  ];
}
```

### 初期化フロー

1. 初期状態: `useState` で `getDefaultCorners(400, 300)` を呼出（仮の初期値）
2. 画像読み込み完了時: `handleImageLoad` で `getDefaultCorners(naturalWidth, naturalHeight)` で再設定

つまり、四隅のデフォルト位置は**常に画像の端から5%のマージン**に配置される。カメラのガイドフレームの位置は一切考慮されない。

## 5. 問題の本質

### フロー図

```
[CameraCapture]                          [CornerSelector]
  ├─ ガイドフレーム（明るい部分）              ├─ デフォルト四隅
  │   位置: 画面中央                          │   位置: 画像端から5%
  │   サイズ: min(80vw, 480px)               │   サイズ: 画像全体の90%
  │   比率: 1.75:1                           │   比率: 画像全体の比率
  │                                          │
  ├─ 撮影 → imageData (JPEG)  ───────────── ├─ image props で受取
  │                                          │
  └─ ガイドフレーム情報は                     └─ ガイドフレーム情報なし
     imageData に含まれない                      → 画像端にデフォルト配置
```

### 具体的な不整合

カメラ（1920x1080）で撮影した場合:
- **ガイドフレームの明るい部分** = 画面中央の `min(80vw, 480px)` x `(480px / 1.75 ≈ 274px)` 相当の領域
  - これはビデオプレビュー全体に対してかなり小さい割合
- **CornerSelector のデフォルト四隅** = 画像の端から5%のマージン
  - 1920x1080 の場合: (96, 54) ~ (1824, 1026) の巨大な四角形

ユーザーがガイドフレーム内に名刺を配置して撮影しても、CornerSelector では画像全体に近い範囲が選択された状態になり、名刺の位置とは全く関係のない枠が表示される。

## 6. 修正アプローチ

### アプローチ: ガイドフレームの相対位置を CornerSelector に渡す

**方針**: CameraCapture でガイドフレームのビデオ上の相対位置を計算し、撮影時にその情報を CornerSelector に渡す。

**具体的な変更**:

#### Step 1: CameraCapture からガイドフレーム位置を出力

`CameraCapture` の `onCapture` コールバックを拡張して、ガイドフレームの位置情報も渡す:

```tsx
// 現在
onCapture: (imageData: string) => void;

// 変更後
onCapture: (imageData: string, guideRect?: { x: number; y: number; width: number; height: number }) => void;
```

撮影時に、ビデオ要素とガイドフレーム要素の位置関係を DOM から計算:

```tsx
const handleCapture = useCallback(() => {
  const video = videoRef.current;
  const canvas = canvasRef.current;
  const guideFrame = guideFrameRef.current; // 新規 ref
  if (!video || !canvas) return;

  // ... 既存のキャプチャ処理 ...

  // ガイドフレームのビデオ座標上の位置を計算
  let guideRect: { x: number; y: number; width: number; height: number } | undefined;
  if (guideFrame) {
    const videoRect = video.getBoundingClientRect();
    const frameRect = guideFrame.getBoundingClientRect();
    
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;
    
    guideRect = {
      x: (frameRect.left - videoRect.left) * scaleX,
      y: (frameRect.top - videoRect.top) * scaleY,
      width: frameRect.width * scaleX,
      height: frameRect.height * scaleY,
    };
  }

  onCapture(imageData, guideRect);
}, [onCapture, stopStream]);
```

#### Step 2: CameraOCRFlow で情報を中継

```tsx
// guideRect を state に保持し、CornerSelector に渡す
const [guideRect, setGuideRect] = useState<{...} | null>(null);

const handleCapture = useCallback((imageData: string, rect?: {...}) => {
  setCapturedImage(imageData);
  setGuideRect(rect ?? null);
  setStep("corners");
}, []);
```

#### Step 3: CornerSelector でガイドフレーム位置をデフォルト値に使用

```tsx
// Props に guideRect を追加
interface CornerSelectorProps {
  image: string;
  guideRect?: { x: number; y: number; width: number; height: number };
  onConfirm: (corners: CornerPoint[]) => void;
  onBack?: () => void;
}

// getDefaultCorners を修正
function getDefaultCorners(
  width: number,
  height: number,
  guideRect?: { x: number; y: number; width: number; height: number }
): CornerPoint[] {
  if (guideRect) {
    // ガイドフレームの四隅を使用
    return [
      { x: guideRect.x, y: guideRect.y },
      { x: guideRect.x + guideRect.width, y: guideRect.y },
      { x: guideRect.x + guideRect.width, y: guideRect.y + guideRect.height },
      { x: guideRect.x, y: guideRect.y + guideRect.height },
    ];
  }
  // フォールバック（画像アップロード時等）
  const pad = 0.05;
  return [
    { x: width * pad, y: height * pad },
    { x: width * (1 - pad), y: height * pad },
    { x: width * (1 - pad), y: height * (1 - pad) },
    { x: width * pad, y: height * (1 - pad) },
  ];
}
```

### 注意点

- `video` 要素は `object-fit: cover` で表示されているため、実際のビデオ描画領域と要素のサイズが異なる場合がある。座標変換時に `object-fit: cover` の影響を考慮する必要がある。
- ImageUploadOCR（画像アップロードフロー）では `guideRect` は不要（画像全体の端をデフォルトで良い）。
- 工数見積: **Short**（2-4時間程度）

## 7. スクリーンショット

| スクリーンショット | パス |
|---|---|
| 名刺新規登録 入力方法選択画面 | `docs/screenshots/camera_new_page.png` |
| カメラUI エラー状態 | `docs/screenshots/camera_error_state.png` |
| カメラUI ガイドオーバーレイ | `docs/screenshots/camera_guide_overlay.png` |
| CornerSelector 初期状態（画像アップロード経由） | `docs/screenshots/corner_selector_initial.png` |
| CornerSelector 初期状態（カメラ撮影経由） | `docs/screenshots/camera_to_corner_selector.png` |
