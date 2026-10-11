#!/bin/bash
# =========================================================
# encode.sh —— 帧序列合成 MP4（H.264，编码器自动 fallback）
# 用法: encode.sh <frames_dir> <fps> <output.mp4> [bitrate]
# 示例: encode.sh ./frames 24 "/workspace/成品.mp4" 4.5M
# =========================================================
set -e
DIR="$1"; FPS="${2:-24}"; OUT="$3"; BR="${4:-4.5M}"
if [ -z "$DIR" ] || [ -z "$OUT" ]; then
  echo "用法: encode.sh <frames_dir> <fps> <output.mp4> [bitrate]" >&2; exit 1
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
