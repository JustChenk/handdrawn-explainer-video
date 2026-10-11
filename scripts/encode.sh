#!/usr/bin/env bash
# =========================================================
# encode.sh —— 帧序列合成 MP4（H.264，编码器自动 fallback）
# 用法: encode.sh <frames_dir> <fps> <output.mp4> [bitrate]
# 示例: encode.sh ./frames 24 "./my-video.mp4" 4.5M
# Windows 注意：若系统无 ffmpeg，本脚本会依次尝试：
#   1. 环境变量 HEV_FFMPEG_DIR（指向包含 ffmpeg 可执行文件的目录）
#   2. 当前工程下的 tools/ 目录（<项目根>/tools/ffmpeg.exe）
# =========================================================
set -e
DIR="$1"; FPS="${2:-24}"; OUT="$3"; BR="${4:-4.5M}"
if [ -z "$DIR" ] || [ -z "$OUT" ]; then
  echo "用法: encode.sh <frames_dir> <fps> <output.mp4> [bitrate]" >&2; exit 1
fi

# ffmpeg 不在 PATH 时的回退探测：HEV_FFMPEG_DIR 环境变量 → 工程 tools/ 目录
if ! command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG_CANDIDATES=()
  if [ -n "$HEV_FFMPEG_DIR" ]; then
    FFMPEG_CANDIDATES+=("$HEV_FFMPEG_DIR")
  fi
  # 从输出文件路径向上（最多 4 层）探测 tools/ 目录，覆盖 <项目根>/<主题文件夹>/ 与 <项目根>/ 两种布局
  PROBE_DIR="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd || pwd)"
  for _ in 1 2 3 4; do
    FFMPEG_CANDIDATES+=("$PROBE_DIR/tools")
    [ "$PROBE_DIR" = "/" ] || [ "$PROBE_DIR" = "${PROBE_DIR%[\\/]*}" ] && break
    PROBE_DIR="${PROBE_DIR%[\\/]*}"
  done

  FOUND_DIR=""
  for d in "${FFMPEG_CANDIDATES[@]}"; do
    if [ -f "$d/ffmpeg.exe" ] || [ -f "$d/ffmpeg" ]; then
      FOUND_DIR="$d"; break
    fi
  done

  if [ -n "$FOUND_DIR" ]; then
    ffmpeg() { "$FOUND_DIR/ffmpeg" "$@"; }
    ffprobe() { "$FOUND_DIR/ffprobe" "$@"; }
    export -f ffmpeg ffprobe 2>/dev/null || true
  else
    echo "错误: 未找到 ffmpeg（PATH、HEV_FFMPEG_DIR、工程 tools/ 均无）。可设置 HEV_FFMPEG_DIR 指向 ffmpeg 所在目录" >&2; exit 1
  fi
fi

if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libx264'; then
  ENC=(-c:v libx264 -preset slow -crf 19)
elif ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libopenh264'; then
  ENC=(-c:v libopenh264 -b:v "$BR" -profile:v high)
elif ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libsvtav1'; then
  ENC=(-c:v libsvtav1 -b:v "$BR")
else
  ENC=(-c:v mpeg4 -q:v 3)
fi

ffmpeg -y -framerate "$FPS" -i "$DIR/f%05d.jpg" "${ENC[@]}" \
  -pix_fmt yuv420p -movflags +faststart "$OUT"

echo "----"
ffprobe -v error -show_entries format=duration,size,bit_rate \
  -of default=noprint_wrappers=1 "$OUT"
