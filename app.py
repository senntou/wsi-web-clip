"""
WSI Clip アプリケーション
WSI（svs）ファイルから画像をクリップするためのWebアプリケーション
"""

import argparse
import os
from flask import Flask, render_template, request, jsonify, Response, send_file
from wsi_handler import WSIHandler
import io

app = Flask(__name__)

# グローバル設定（起動時に設定される）
wsi_handler: WSIHandler = None
client_save_enabled: bool = False


@app.route('/')
def index():
    """メインページを表示"""
    return render_template('index.html', client_save=client_save_enabled)


@app.route('/api/files')
def get_files():
    """svsファイル一覧を取得"""
    try:
        files = wsi_handler.get_svs_files()
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/info/<filename>')
def get_info(filename: str):
    """WSIのメタ情報を取得"""
    try:
        info = wsi_handler.get_slide_info(filename)
        return jsonify(info)
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/thumbnail/<filename>')
def get_thumbnail(filename: str):
    """サムネイル画像を取得"""
    try:
        # クエリパラメータでサイズを指定可能
        max_width = request.args.get('max_width', 800, type=int)
        max_height = request.args.get('max_height', 800, type=int)

        image_bytes = wsi_handler.get_thumbnail(filename, (max_width, max_height))

        return Response(image_bytes, mimetype='image/png')
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/region')
def get_region():
    """
    指定領域の画像を取得

    クエリパラメータ:
        filename: svsファイル名
        x: 領域の左上X座標（レベル0座標系）
        y: 領域の左上Y座標（レベル0座標系）
        width: 領域の幅（レベル0座標系）
        height: 領域の高さ（レベル0座標系）
    """
    try:
        filename = request.args.get('filename')
        x = request.args.get('x', type=int)
        y = request.args.get('y', type=int)
        width = request.args.get('width', type=int)
        height = request.args.get('height', type=int)

        # パラメータ検証
        if not all([filename, x is not None, y is not None, width, height]):
            return jsonify({'error': '必須パラメータが不足しています'}), 400

        if width <= 0 or height <= 0:
            return jsonify({'error': '幅と高さは正の値である必要があります'}), 400

        image_bytes, meta = wsi_handler.get_region(filename, x, y, width, height)

        # メタ情報をヘッダーに含める
        response = Response(image_bytes, mimetype='image/png')
        response.headers['X-Level-Used'] = str(meta['level_used'])
        response.headers['X-Output-Width'] = str(meta['output_size'][0])
        response.headers['X-Output-Height'] = str(meta['output_size'][1])

        return response
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/save', methods=['POST'])
def save_region():
    """
    現在の視野を保存

    リクエストボディ（JSON）:
        filename: svsファイル名
        x: 領域の左上X座標（レベル0座標系）
        y: 領域の左上Y座標（レベル0座標系）
        width: 領域の幅（レベル0座標系）
        height: 領域の高さ（レベル0座標系）
        save_filename: 保存するファイル名
        client_download: クライアント側でダウンロードする場合はTrue
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'JSONデータが必要です'}), 400

        filename = data.get('filename')
        x = data.get('x')
        y = data.get('y')
        width = data.get('width')
        height = data.get('height')
        save_filename = data.get('save_filename')
        client_download = data.get('client_download', False)

        # パラメータ検証
        if not all([filename, x is not None, y is not None, width, height, save_filename]):
            return jsonify({'error': '必須パラメータが不足しています'}), 400

        if width <= 0 or height <= 0:
            return jsonify({'error': '幅と高さは正の値である必要があります'}), 400

        # クライアント側ダウンロードが有効で、リクエストされた場合
        if client_save_enabled and client_download:
            image_bytes, meta = wsi_handler.get_region(filename, int(x), int(y), int(width), int(height))

            # ファイル名の拡張子を確認
            if not save_filename.lower().endswith('.png'):
                save_filename += '.png'

            return Response(
                image_bytes,
                mimetype='image/png',
                headers={
                    'Content-Disposition': f'attachment; filename="{save_filename}"'
                }
            )

        # サーバー側保存
        save_path = wsi_handler.save_region(
            filename, int(x), int(y), int(width), int(height), save_filename
        )

        return jsonify({
            'success': True,
            'message': f'画像を保存しました',
            'path': save_path
        })
    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/config')
def get_config():
    """アプリケーション設定を取得"""
    return jsonify({
        'client_save_enabled': client_save_enabled,
        'max_pixels': wsi_handler.max_pixels
    })


def main():
    """アプリケーションのエントリーポイント"""
    global wsi_handler, client_save_enabled

    parser = argparse.ArgumentParser(
        description='WSI Clip - WSI（svs）ファイルから画像をクリップするWebアプリ'
    )
    parser.add_argument(
        '--svs-dir',
        required=True,
        help='svsファイルが格納されているディレクトリ'
    )
    parser.add_argument(
        '--save-dir',
        required=True,
        help='画像保存先ディレクトリ'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=8080,
        help='ポート番号（デフォルト: 8080）'
    )
    parser.add_argument(
        '--max-pixels',
        type=int,
        default=1024,
        help='出力画像の1辺の最大ピクセル数（デフォルト: 2048）'
    )

    args = parser.parse_args()

    # ディレクトリの存在確認
    if not os.path.exists(args.svs_dir):
        print(f"エラー: svsディレクトリが存在しません: {args.svs_dir}")
        return

    # 保存先ディレクトリが存在しない場合は作成
    os.makedirs(args.save_dir, exist_ok=True)

    # グローバル設定を初期化
    wsi_handler = WSIHandler(args.svs_dir, args.save_dir, args.max_pixels)
    client_save_enabled = True

    print(f"WSI Clip を起動します")
    print(f"  svsディレクトリ: {args.svs_dir}")
    print(f"  保存先ディレクトリ: {args.save_dir}")
    print(f"  ポート: {args.port}")
    print(f"  クライアント側保存: {'有効' if client_save_enabled else '無効'}")
    print(f"  最大ピクセル数: {args.max_pixels}")
    print(f"\nブラウザで http://localhost:{args.port} にアクセスしてください")

    app.run(host='0.0.0.0', port=args.port, debug=False)


if __name__ == '__main__':
    main()
