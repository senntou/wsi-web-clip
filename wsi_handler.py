"""
WSI（Whole Slide Image）操作のためのハンドラクラス
openslideライブラリをラップして、サムネイル取得、領域取得、画像保存などの機能を提供
"""

import os
from typing import Tuple, Optional, Dict, Any
import openslide
from PIL import Image
import io
import math


class WSIHandler:
    """WSIファイルを操作するためのクラス"""

    def __init__(self, svs_dir: str, save_dir: str, max_pixels: int = 1024):
        """
        WSIHandlerの初期化

        Args:
            svs_dir: svsファイルが格納されているディレクトリ
            save_dir: 画像保存先ディレクトリ
            max_pixels: 出力画像の1辺の最大ピクセル数
        """
        self.svs_dir = svs_dir
        self.save_dir = save_dir
        self.max_pixels = max_pixels
        self._slide_cache: Dict[str, openslide.OpenSlide] = {}

    def get_svs_files(self) -> list:
        """
        svs_dir内のsvsファイル一覧を取得

        Returns:
            svsファイル名のリスト
        """
        if not os.path.exists(self.svs_dir):
            return []

        svs_files = []
        for filename in os.listdir(self.svs_dir):
            if filename.lower().endswith(('.svs', '.ndpi', '.tif', '.tiff', '.mrxs')):
                svs_files.append(filename)

        return sorted(svs_files)

    def _get_slide(self, filename: str) -> openslide.OpenSlide:
        """
        スライドオブジェクトを取得（キャッシュ機能付き）

        Args:
            filename: svsファイル名

        Returns:
            OpenSlideオブジェクト
        """
        if filename not in self._slide_cache:
            filepath = os.path.join(self.svs_dir, filename)
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"ファイルが見つかりません: {filepath}")
            self._slide_cache[filename] = openslide.OpenSlide(filepath)

        return self._slide_cache[filename]

    def get_slide_info(self, filename: str) -> Dict[str, Any]:
        """
        WSIのメタ情報を取得

        Args:
            filename: svsファイル名

        Returns:
            スライド情報の辞書（幅、高さ、レベル数など）
        """
        slide = self._get_slide(filename)

        # 各レベルの情報を取得
        levels_info = []
        for i in range(slide.level_count):
            levels_info.append({
                'level': i,
                'dimensions': slide.level_dimensions[i],
                'downsample': slide.level_downsamples[i]
            })

        return {
            'filename': filename,
            'dimensions': slide.dimensions,  # レベル0（最高解像度）のサイズ
            'level_count': slide.level_count,
            'levels': levels_info,
            'properties': dict(slide.properties) if slide.properties else {}
        }

    def get_thumbnail(self, filename: str, max_size: Tuple[int, int] = (800, 800)) -> bytes:
        """
        サムネイル画像を取得

        Args:
            filename: svsファイル名
            max_size: サムネイルの最大サイズ（幅, 高さ）

        Returns:
            PNG形式の画像バイト列
        """
        slide = self._get_slide(filename)
        thumbnail = slide.get_thumbnail(max_size)

        # PNG形式でバイト列に変換
        buffer = io.BytesIO()
        thumbnail.save(buffer, format='PNG')
        buffer.seek(0)

        return buffer.getvalue()

    def _calculate_best_level(self, region_width: int, region_height: int) -> Tuple[int, float]:
        """
        指定された領域サイズに対して、最適なレベルと出力スケールを計算
        ピクセル上限を超えない最高解像度のレベルを選択

        Args:
            region_width: 領域の幅（レベル0座標系）
            region_height: 領域の高さ（レベル0座標系）

        Returns:
            (最適なレベル, 出力スケール) のタプル
        """
        # 出力サイズがmax_pixelsに収まるようなダウンサンプル率を計算
        max_dimension = max(region_width, region_height)
        required_downsample = max_dimension / self.max_pixels

        return required_downsample

    def get_region(self, filename: str, x: int, y: int, width: int, height: int) -> Tuple[bytes, Dict[str, Any]]:
        """
        指定された領域の画像を取得（最適なレベルを自動選択）

        Args:
            filename: svsファイル名
            x: 領域の左上X座標（レベル0座標系）
            y: 領域の左上Y座標（レベル0座標系）
            width: 領域の幅（レベル0座標系）
            height: 領域の高さ（レベル0座標系）

        Returns:
            (PNG形式の画像バイト列, メタ情報辞書) のタプル
        """
        slide = self._get_slide(filename)

        # 必要なダウンサンプル率を計算
        required_downsample = self._calculate_best_level(width, height)

        # 最適なレベルを選択（required_downsampleに最も近い、かつそれ以上のダウンサンプル率を持つレベル）
        best_level = 0
        for i, downsample in enumerate(slide.level_downsamples):
            if downsample <= required_downsample:
                best_level = i
            else:
                break

        # 選択したレベルでの読み取りサイズを計算
        level_downsample = slide.level_downsamples[best_level]
        read_width = int(width / level_downsample)
        read_height = int(height / level_downsample)

        # 画像を読み取り
        region = slide.read_region((x, y), best_level, (read_width, read_height))

        # RGBAからRGBに変換（背景を白にする）
        if region.mode == 'RGBA':
            background = Image.new('RGB', region.size, (255, 255, 255))
            background.paste(region, mask=region.split()[3])
            region = background

        # 出力サイズがmax_pixelsを超える場合はリサイズ
        output_width = read_width
        output_height = read_height

        if max(output_width, output_height) > self.max_pixels:
            scale = self.max_pixels / max(output_width, output_height)
            output_width = int(output_width * scale)
            output_height = int(output_height * scale)
            region = region.resize((output_width, output_height), Image.LANCZOS)

        # PNG形式でバイト列に変換
        buffer = io.BytesIO()
        region.save(buffer, format='PNG')
        buffer.seek(0)

        meta = {
            'level_used': best_level,
            'level_downsample': level_downsample,
            'output_size': (output_width, output_height),
            'original_region': {'x': x, 'y': y, 'width': width, 'height': height}
        }

        return buffer.getvalue(), meta

    def save_region(self, filename: str, x: int, y: int, width: int, height: int,
                    save_filename: str) -> str:
        """
        指定された領域の画像をサーバー側に保存

        Args:
            filename: svsファイル名
            x: 領域の左上X座標（レベル0座標系）
            y: 領域の左上Y座標（レベル0座標系）
            width: 領域の幅（レベル0座標系）
            height: 領域の高さ（レベル0座標系）
            save_filename: 保存するファイル名

        Returns:
            保存したファイルのパス
        """
        # 画像を取得
        image_bytes, meta = self.get_region(filename, x, y, width, height)

        # 保存先パスを構築
        if not save_filename.lower().endswith('.png'):
            save_filename += '.png'

        save_path = os.path.join(self.save_dir, save_filename)

        # ディレクトリが存在しない場合は作成
        os.makedirs(os.path.dirname(save_path) if os.path.dirname(save_path) else self.save_dir, exist_ok=True)

        # 画像を保存
        with open(save_path, 'wb') as f:
            f.write(image_bytes)

        return save_path

    def close_all(self):
        """キャッシュされているすべてのスライドを閉じる"""
        for slide in self._slide_cache.values():
            slide.close()
        self._slide_cache.clear()
