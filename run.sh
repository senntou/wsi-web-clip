#!/bin/bash

# WSI Clip 起動スクリプト
# 環境変数または引数でディレクトリとポートを設定可能

set -e

# 引数の初期値
SVS_DIR="" # WSIファイルが格納されているディレクトリのパス
SAVE_DIR="output/"
PORT="8080"
MAX_PIXELS=""

# アプリケーションを起動
python app.py --svs-dir "${SVS_DIR}" --save-dir "${SAVE_DIR}" --port "${PORT}" ${MAX_PIXELS}
