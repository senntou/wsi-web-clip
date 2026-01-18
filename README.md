# WSI Clip

WSI（Whole Slide Image）ファイルから領域を選択して画像をクリップするためのWebアプリケーションです。

## 機能

- WSI全体のサムネイル表示
- マウスドラッグによる矩形選択・正方形選択
- 選択領域の拡大表示（倍率は自動調整）
- サーバー側への画像保存
- クライアント側での画像ダウンロード（オプション）

## 対応フォーマット

- Aperio SVS (.svs)
- Hamamatsu NDPI (.ndpi)
- TIFF (.tif, .tiff)
- MIRAX (.mrxs)

## 必要要件

### システム要件

- Python 3.8以上
- OpenSlideライブラリ（システムにインストールが必要）

### OpenSlideのインストール

**Ubuntu/Debian:**
```bash
sudo apt-get install openslide-tools libopenslide0
```

**macOS (Homebrew):**
```bash
brew install openslide
```

**Windows:**
OpenSlideの公式サイトからバイナリをダウンロードしてください。

## インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd wsiclip

# 仮想環境を作成（推奨）
python -m venv venv
source venv/bin/activate  # Linux/macOS
# または
# venv\Scripts\activate  # Windows

# 依存パッケージをインストール
pip install -r requirements.txt
```

## 使用方法

### 基本的な起動方法

```bash
python app.py --svs-dir /path/to/svs/files --save-dir /path/to/save/images
```

### シェルスクリプトを使用した起動

```bash
# 実行権限を付与（初回のみ）
chmod +x run.sh

# デフォルト設定で起動
./run.sh

# オプションを指定して起動
./run.sh --svs-dir /custom/path --save-dir /custom/save --port 9000
```

### コマンドラインオプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--svs-dir` | WSIファイルが格納されているディレクトリ | 必須 |
| `--save-dir` | 画像保存先ディレクトリ | 必須 |
| `--port` | Webサーバーのポート番号 | 8080 |
| `--client-save` | クライアント側での画像保存を有効化 | 無効 |
| `--max-pixels` | 出力画像の1辺の最大ピクセル数 | 2048 |

### 使用例

```bash
# 基本的な使用
python app.py --svs-dir ./slides --save-dir ./output

# ポートを変更して起動
python app.py --svs-dir ./slides --save-dir ./output --port 9000

# クライアント側保存を有効化
python app.py --svs-dir ./slides --save-dir ./output --client-save

# 最大ピクセル数を変更
python app.py --svs-dir ./slides --save-dir ./output --max-pixels 4096
```

## アクセス

アプリケーション起動後、ブラウザで以下のURLにアクセスしてください：

```
http://localhost:8080
```

（ポートを変更した場合は、指定したポート番号に置き換えてください）

## 操作方法

1. ファイル一覧からWSIファイルを選択
2. サムネイル上でマウスをドラッグして領域を選択
   - Shiftキーを押しながらドラッグすると正方形選択
3. 「適用」ボタンで選択領域を拡大表示
4. 「保存」ボタンで現在の視野を画像として保存

## ライセンス

MIT License
