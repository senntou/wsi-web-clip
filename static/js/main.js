/**
 * WSI Clip フロントエンド
 * 矩形選択、API呼び出し、UI操作を担当
 */

// アプリケーション状態
const state = {
    currentFile: null,          // 現在選択中のファイル
    slideInfo: null,            // 現在のスライド情報
    thumbnailImage: null,       // サムネイル画像オブジェクト
    regionImage: null,          // 領域画像オブジェクト
    // 現在表示している範囲（レベル0座標系）
    currentView: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
    },
    // 選択中の範囲（キャンバス座標系）
    selection: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        active: false
    },
    isSelecting: false,         // ドラッグ中かどうか
    hasSelection: false,        // 有効な選択範囲があるか
    isViewingThumbnail: true,   // サムネイル表示中かどうか
    isLoading: false            // ローディング中かどうか
};

// DOM要素の参照
const elements = {
    fileList: document.getElementById('file-list'),
    slideInfo: document.getElementById('slide-info'),
    imageCanvas: document.getElementById('image-canvas'),
    selectionCanvas: document.getElementById('selection-canvas'),
    canvasContainer: document.getElementById('canvas-container'),
    placeholder: document.getElementById('placeholder'),
    viewInfo: document.getElementById('view-info'),
    btnReset: document.getElementById('btn-reset'),
    btnApply: document.getElementById('btn-apply'),
    btnSave: document.getElementById('btn-save'),
    chkSquare: document.getElementById('chk-square'),
    saveFilename: document.getElementById('save-filename'),
    saveResult: document.getElementById('save-result'),
    statusBar: document.getElementById('status-bar')
};

// キャンバスコンテキスト
const ctx = {
    image: elements.imageCanvas.getContext('2d'),
    selection: elements.selectionCanvas.getContext('2d')
};

/**
 * 初期化
 */
async function init() {
    // ファイル一覧を取得
    await loadFileList();

    // イベントリスナーを設定
    setupEventListeners();

    updateStatus('準備完了');
}

/**
 * ファイル一覧を取得して表示
 */
async function loadFileList() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        elements.fileList.innerHTML = '';

        if (data.files.length === 0) {
            elements.fileList.innerHTML = '<p class="no-files">ファイルがありません</p>';
            return;
        }

        data.files.forEach(filename => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.textContent = filename;
            div.addEventListener('click', () => selectFile(filename));
            elements.fileList.appendChild(div);
        });
    } catch (error) {
        console.error('ファイル一覧の取得に失敗:', error);
        updateStatus('エラー: ファイル一覧の取得に失敗しました');
    }
}

/**
 * ファイルを選択
 */
async function selectFile(filename) {
    if (state.isLoading || state.currentFile === filename) {
        return;
    }

    // 選択状態を更新
    const items = elements.fileList.querySelectorAll('.file-item');
    items.forEach(item => {
        item.classList.remove('selected');
        if (item.textContent === filename) {
            item.classList.add('selected');
        }
    });

    state.currentFile = filename;
    state.isLoading = true;
    updateStatus(`${filename} を読み込み中...`);

    try {
        // スライド情報を取得
        const infoResponse = await fetch(`/api/info/${encodeURIComponent(filename)}`);
        state.slideInfo = await infoResponse.json();

        if (state.slideInfo.error) {
            throw new Error(state.slideInfo.error);
        }

        // スライド情報を表示
        displaySlideInfo();

        // サムネイルを読み込み
        await loadThumbnail();

        // ビューをリセット
        resetView();

        elements.placeholder.style.display = 'none';
        updateStatus(`${filename} を表示中`);
    } catch (error) {
        console.error('ファイルの読み込みに失敗:', error);
        updateStatus(`エラー: ${error.message}`);
    } finally {
        state.isLoading = false;
    }
}

/**
 * スライド情報を表示
 */
function displaySlideInfo() {
    const info = state.slideInfo;
    elements.slideInfo.innerHTML = `
        <p><span class="label">サイズ:</span> ${info.dimensions[0]} x ${info.dimensions[1]}</p>
        <p><span class="label">レベル数:</span> ${info.level_count}</p>
    `;
}

/**
 * サムネイルを読み込み
 */
async function loadThumbnail() {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            state.thumbnailImage = img;
            state.isViewingThumbnail = true;

            // 現在の表示範囲を全体に設定
            state.currentView = {
                x: 0,
                y: 0,
                width: state.slideInfo.dimensions[0],
                height: state.slideInfo.dimensions[1]
            };

            drawImage();
            resolve();
        };
        img.onerror = () => reject(new Error('サムネイルの読み込みに失敗'));
        img.src = `/api/thumbnail/${encodeURIComponent(state.currentFile)}?max_width=800&max_height=800`;
    });
}

/**
 * 画像を描画
 */
function drawImage() {
    const img = state.isViewingThumbnail ? state.thumbnailImage : state.regionImage;
    if (!img) return;

    // コンテナサイズを取得
    const containerRect = elements.canvasContainer.getBoundingClientRect();
    const maxWidth = containerRect.width - 20;
    const maxHeight = containerRect.height - 20;

    // アスペクト比を維持してサイズを計算
    let displayWidth = img.width;
    let displayHeight = img.height;

    const scale = Math.min(maxWidth / displayWidth, maxHeight / displayHeight, 1);
    displayWidth = Math.floor(displayWidth * scale);
    displayHeight = Math.floor(displayHeight * scale);

    // キャンバスサイズを設定
    elements.imageCanvas.width = displayWidth;
    elements.imageCanvas.height = displayHeight;
    elements.selectionCanvas.width = displayWidth;
    elements.selectionCanvas.height = displayHeight;

    // 画像を描画
    ctx.image.drawImage(img, 0, 0, displayWidth, displayHeight);

    // 選択範囲をクリア
    clearSelection();

    // 視野情報を更新
    updateViewInfo();
}

/**
 * ビューをリセット（サムネイル表示に戻る）
 */
function resetView() {
    state.isViewingThumbnail = true;
    state.currentView = {
        x: 0,
        y: 0,
        width: state.slideInfo.dimensions[0],
        height: state.slideInfo.dimensions[1]
    };
    state.hasSelection = false;

    drawImage();
    updateButtons();
}

/**
 * 視野情報を更新
 */
function updateViewInfo() {
    const view = state.currentView;
    elements.viewInfo.innerHTML = `
        <p><strong>視野:</strong> X: ${view.x}, Y: ${view.y}</p>
        <p><strong>サイズ:</strong> ${view.width} x ${view.height}</p>
        <p><strong>表示:</strong> ${state.isViewingThumbnail ? 'サムネイル' : '領域'}</p>
    `;
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // キャンバスのマウスイベント
    elements.canvasContainer.addEventListener('mousedown', handleMouseDown);
    elements.canvasContainer.addEventListener('mousemove', handleMouseMove);
    elements.canvasContainer.addEventListener('mouseup', handleMouseUp);
    elements.canvasContainer.addEventListener('mouseleave', handleMouseUp);

    // ボタンのクリックイベント
    elements.btnReset.addEventListener('click', handleReset);
    elements.btnApply.addEventListener('click', handleApply);
    elements.btnSave.addEventListener('click', handleSave);

    // Shiftキーの状態をチェックボックスに反映
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') {
            elements.chkSquare.checked = true;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            elements.chkSquare.checked = false;
        }
    });

    // ウィンドウリサイズ
    window.addEventListener('resize', () => {
        if (state.currentFile) {
            drawImage();
        }
    });
}

/**
 * マウスダウンハンドラ
 */
function handleMouseDown(e) {
    if (!state.currentFile || state.isLoading) return;

    const rect = elements.imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // キャンバス範囲内かチェック
    if (x < 0 || x > elements.imageCanvas.width || y < 0 || y > elements.imageCanvas.height) {
        return;
    }

    state.isSelecting = true;
    state.selection.startX = x;
    state.selection.startY = y;
    state.selection.endX = x;
    state.selection.endY = y;
    state.selection.active = true;
}

/**
 * マウス移動ハンドラ
 */
function handleMouseMove(e) {
    if (!state.isSelecting) return;

    const rect = elements.imageCanvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // キャンバス範囲内に制限
    x = Math.max(0, Math.min(x, elements.imageCanvas.width));
    y = Math.max(0, Math.min(y, elements.imageCanvas.height));

    // 正方形選択モードの場合
    if (elements.chkSquare.checked) {
        const dx = x - state.selection.startX;
        const dy = y - state.selection.startY;
        const size = Math.max(Math.abs(dx), Math.abs(dy));

        x = state.selection.startX + (dx >= 0 ? size : -size);
        y = state.selection.startY + (dy >= 0 ? size : -size);

        // キャンバス範囲内に再制限
        x = Math.max(0, Math.min(x, elements.imageCanvas.width));
        y = Math.max(0, Math.min(y, elements.imageCanvas.height));
    }

    state.selection.endX = x;
    state.selection.endY = y;

    drawSelection();
}

/**
 * マウスアップハンドラ
 */
function handleMouseUp(e) {
    if (!state.isSelecting) return;

    state.isSelecting = false;

    // 選択範囲の有効性をチェック
    const width = Math.abs(state.selection.endX - state.selection.startX);
    const height = Math.abs(state.selection.endY - state.selection.startY);

    state.hasSelection = width > 5 && height > 5;
    updateButtons();
}

/**
 * 選択範囲を描画
 */
function drawSelection() {
    clearSelection();

    if (!state.selection.active) return;

    const x = Math.min(state.selection.startX, state.selection.endX);
    const y = Math.min(state.selection.startY, state.selection.endY);
    const width = Math.abs(state.selection.endX - state.selection.startX);
    const height = Math.abs(state.selection.endY - state.selection.startY);

    // 選択範囲を描画
    ctx.selection.strokeStyle = '#3498db';
    ctx.selection.lineWidth = 2;
    ctx.selection.setLineDash([5, 5]);
    ctx.selection.strokeRect(x, y, width, height);

    // 半透明の塗りつぶし
    ctx.selection.fillStyle = 'rgba(52, 152, 219, 0.2)';
    ctx.selection.fillRect(x, y, width, height);
}

/**
 * 選択範囲をクリア
 */
function clearSelection() {
    ctx.selection.clearRect(0, 0, elements.selectionCanvas.width, elements.selectionCanvas.height);
}

/**
 * ボタンの状態を更新
 */
function updateButtons() {
    elements.btnReset.disabled = state.isViewingThumbnail || !state.currentFile;
    elements.btnApply.disabled = !state.hasSelection || state.isLoading;
    elements.btnSave.disabled = !state.currentFile || state.isLoading;
}

/**
 * リセットボタンのハンドラ
 */
function handleReset() {
    if (state.thumbnailImage) {
        resetView();
        updateStatus('全体表示に戻りました');
    }
}

/**
 * 適用ボタンのハンドラ（選択範囲をズーム表示）
 */
async function handleApply() {
    if (!state.hasSelection || state.isLoading) return;

    // キャンバス座標からレベル0座標に変換
    const canvasWidth = elements.imageCanvas.width;
    const canvasHeight = elements.imageCanvas.height;

    const scaleX = state.currentView.width / canvasWidth;
    const scaleY = state.currentView.height / canvasHeight;

    const selX = Math.min(state.selection.startX, state.selection.endX);
    const selY = Math.min(state.selection.startY, state.selection.endY);
    const selWidth = Math.abs(state.selection.endX - state.selection.startX);
    const selHeight = Math.abs(state.selection.endY - state.selection.startY);

    // レベル0座標系に変換
    const regionX = Math.floor(state.currentView.x + selX * scaleX);
    const regionY = Math.floor(state.currentView.y + selY * scaleY);
    const regionWidth = Math.floor(selWidth * scaleX);
    const regionHeight = Math.floor(selHeight * scaleY);

    state.isLoading = true;
    updateStatus('領域を読み込み中...');
    elements.btnApply.disabled = true;

    try {
        // 領域画像を取得
        const url = `/api/region?filename=${encodeURIComponent(state.currentFile)}&x=${regionX}&y=${regionY}&width=${regionWidth}&height=${regionHeight}`;

        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '領域の取得に失敗');
        }

        const blob = await response.blob();
        const img = new Image();

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('画像の読み込みに失敗'));
            img.src = URL.createObjectURL(blob);
        });

        state.regionImage = img;
        state.isViewingThumbnail = false;
        state.currentView = {
            x: regionX,
            y: regionY,
            width: regionWidth,
            height: regionHeight
        };
        state.hasSelection = false;

        drawImage();
        updateButtons();
        updateStatus('領域を表示中');
    } catch (error) {
        console.error('領域の取得に失敗:', error);
        updateStatus(`エラー: ${error.message}`);
    } finally {
        state.isLoading = false;
        updateButtons();
    }
}

/**
 * 保存ボタンのハンドラ
 */
async function handleSave() {
    if (!state.currentFile || state.isLoading) return;

    const filename = elements.saveFilename.value.trim() || 'output';
    const clientDownload = CONFIG.clientSaveEnabled &&
        document.querySelector('input[name="save-mode"]:checked')?.value === 'client';

    state.isLoading = true;
    updateStatus('画像を保存中...');
    elements.btnSave.disabled = true;

    try {
        const requestData = {
            filename: state.currentFile,
            x: state.currentView.x,
            y: state.currentView.y,
            width: state.currentView.width,
            height: state.currentView.height,
            save_filename: filename,
            client_download: clientDownload
        };

        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (clientDownload) {
            // クライアント側ダウンロード
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showSaveResult('ダウンロードを開始しました', false);
            updateStatus('画像をダウンロードしました');
        } else {
            // サーバー側保存
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            showSaveResult(`保存しました: ${data.path}`, false);
            updateStatus('画像を保存しました');
        }
    } catch (error) {
        console.error('保存に失敗:', error);
        showSaveResult(`エラー: ${error.message}`, true);
        updateStatus(`エラー: ${error.message}`);
    } finally {
        state.isLoading = false;
        updateButtons();
    }
}

/**
 * 保存結果を表示
 */
function showSaveResult(message, isError) {
    elements.saveResult.textContent = message;
    elements.saveResult.className = 'save-result ' + (isError ? 'error' : 'success');

    // 5秒後にクリア
    setTimeout(() => {
        elements.saveResult.textContent = '';
        elements.saveResult.className = 'save-result';
    }, 5000);
}

/**
 * ステータスバーを更新
 */
function updateStatus(message) {
    elements.statusBar.textContent = message;
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', init);
