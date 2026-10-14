#!/usr/bin/env bash
# =========================================================
# merge_audio.sh —— BGM 配乐合成：铺底 + 卡点贴点（bgm-beat-align skill 执行端）
#
# 两个模式：
#   ① 铺底模式（默认）—— BGM 整条变速后铺满全片，可选画面自动变速压进 50~60s 窗口
#      （源自项目「配乐版默认风格」，即 A 板一键合成）
#   ② 贴点模式（--align，或给 --offset/--cut 即触发）—— 画面原样（h264/hevc 走
#      -c:v copy 零重编码），BGM 变速 + 偏移贴点 + 节拍截断 + fade out，即 B0 零渲染对齐
#
# 固化经验规则（实战踩坑，勿改回去；标【补】的是项目版没有、按 SKILL.md 纪律新增）：
#   1. atempo 单级范围 0.5~2.0，超 2.0 必须级联（3x = atempo=2.0,atempo=1.5），本脚本自动拆级
#   2. 多轨混音 amix 必须 normalize=0，否则电平被自动压低、听感发闷（代价：留意叠加削波）
#   3. 画面优先：音频与视频时长不一致时，音频侧 atrim 截断 / apad 补齐，永不改视频时长
#   4. 视频无音轨 → 直接加轨；已有音轨 → 默认丢弃换新轨，--keep-audio 时混音（铺底模式原声随画面变速）
#   5.【补】音频收尾一律 fade out（默认 0.5s，--fade 可调，--fade 0 关闭），禁止硬切收尾——
#      项目版铺底原为硬切，此处按 SKILL.md 纪律 4（截断落在节拍 + fade）统一补上
#   6.【补】画面无需变速时（贴点模式 / 铺底自动倍速落在 1x）-c:v copy 零重编码；
#      源编码不是 h264/hevc 时自动回退 libx264 重编码
#
# 依赖：bash（Windows 用 Git Bash）+ ffmpeg/ffprobe。路径探测（encode.sh 同款规则）：
#   PATH → 环境变量 BBA_FFMPEG_DIR（指向含 ffmpeg 的目录）→ 从视频/脚本路径向上最多 4 层找 tools/
#
# 与 beat_align.py 的配合（分析 → 决策 → 合成，全流程见 SKILL.md）：
#   python beat_align.py <BGM> --scenes <幕边界秒列表> --speed 1.5 --json beats.json
#   对齐报告给出每个幕边界的最近拍与偏差 d（d = 拍 - 边界）。贴点参数换算：
#     --offset = 幕边界 - 最近拍 = -d   把该拍精确贴上幕边界；正=后移(adelay)，负=掐头(atrim)
#     --cut    = 建议截断点 + offset    换算到成片时间轴；恰在片尾时可省略（默认=视频时长）
#   --speed/-s 必须与 beat_align.py 的 --speed 完全一致，否则全盘错位
#
# ── 铺底模式用法 ──
#   bash merge_audio.sh -a <音频> [选项] <视频1> [视频2 ...]
#   选项：-a 音频（必填，通用版无默认 BGM）  -s 音频倍速（默认 1.5，范围 0.5~4）
#        -V 视频倍速偏好（默认 3，范围 0.5~10；50~60s 窗口护栏常开，落不进自动调速至 -T）
#        -T 目标时长（默认 55，窗口中心）     -o 输出文件名（仅单个视频时生效）
#        -t 输出后缀标签（默认 配乐版）       --keep-audio 保留视频原音轨混音
#   示例：
#     bash merge_audio.sh -a assets/We_Never.mp3 成片.mp4        # 压窗铺底（A 板）
#     bash merge_audio.sh -a bgm.mp3 -s 2 --keep-audio 成片.mp4  # BGM 2x + 原声混音
#     bash merge_audio.sh -a bgm.mp3 --fade 0 成片.mp4           # 复刻项目版硬切收尾
#
# ── 贴点模式用法 ──
#   bash merge_audio.sh --align [选项] -a <音频> <视频>          # 仅单个视频
#   选项：--offset <sec>  整体偏移（换算见上；默认 0）
#        --cut <sec>      成片时间轴上的音频截断点（默认=视频时长，应落在节拍上）
#        --fade <sec>     fade out 时长（默认 0.5，两模式通用，不触发贴点模式）
#        -a/-s/-o/-t/--keep-audio 同铺底模式；输出后缀默认 卡点版
#        -V/-T 无效：贴点模式画面优先、视频原样
#   示例：
#     # B0 零渲染验听：BGM 1.5x、掐头 0.08s 贴点，视频零重编码，秒级完成
#     bash merge_audio.sh --align -a assets/We_Never.mp3 -s 1.5 --offset -0.08 成片.mp4
#     # 最简 B0（等价于 beat_align.py 输出的截断点命令模板）
#     bash merge_audio.sh --align -a bgm.mp3 -s 1.5 成片.mp4
#
# 输出：<视频同目录>/<原名>_<标签>.mp4；已存在则跳过（防覆盖，重跑先手动删）
# 中文/空格路径：参数全部引号包裹；中文文件名只经 -i 传入、不内嵌 ffmpeg filter，规避转义坑
# =========================================================
set -uo pipefail

# ── 参数解析 ──
AUDIO=""; ASPEED="1.5"; VPREF="3"; TARGET="55"
TAG=""; OUTPUT_NAME=""; KEEP_AUDIO=0; ALIGN=0
OFFSET=""; CUT=""; FADE=""; VIDEOS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -a) AUDIO="$2"; shift 2 ;;
    -s) ASPEED="$2"; shift 2 ;;
    -V) VPREF="$2"; shift 2 ;;
    -T) TARGET="$2"; shift 2 ;;
    -o) OUTPUT_NAME="$2"; shift 2 ;;
    -t) TAG="$2"; shift 2 ;;
    --keep-audio) KEEP_AUDIO=1; shift ;;
    --align) ALIGN=1; shift ;;
    --offset) OFFSET="$2"; ALIGN=1; shift 2 ;;
    --cut) CUT="$2"; ALIGN=1; shift 2 ;;
    --fade) FADE="$2"; shift 2 ;;
    -h|--help) awk 'NR>1{ if ($0 ~ /^#/) { sub(/^# ?/,""); print } else { exit } }' "$0"; exit 0 ;;
    -*) echo "未知选项：$1" >&2; exit 1 ;;
    *)  VIDEOS+=("$1"); shift ;;
  esac
done

# 规则 1：成片窗口 50s~60s；自动倍速下限 1x（不慢放）、上限 8x
WIN_MIN=50; WIN_MAX=60; AUTO_V_MIN=1; AUTO_V_MAX=8

[[ ${#VIDEOS[@]} -gt 0 ]] || { echo "用法：$0 [-a 音频] [选项] <视频...>（-h 看全部用法）" >&2; exit 1; }
if [[ $ALIGN -eq 1 && ${#VIDEOS[@]} -gt 1 ]]; then
  echo "错误：贴点模式（--align）一次只处理一个视频（偏移/截断参数是按片定的）" >&2; exit 1
fi

# 默认值：标签分模式（贴点=卡点版，铺底=配乐版）；fade 统一 0.5s
if [[ -z "$TAG" ]]; then
  if [[ $ALIGN -eq 1 ]]; then TAG="卡点版"; else TAG="配乐版"; fi
fi
[[ -n "$FADE" ]] || FADE="0.5"
OFFSET=${OFFSET:-0}

[[ -n "$AUDIO" ]] || { echo "错误：未指定音频。通用版无默认 BGM，请用 -a <音频路径> 指定" >&2; exit 1; }
awk -v s="$ASPEED" 'BEGIN{exit !(s>=0.5 && s<=4)}'   || { echo "错误：-s 范围 0.5~4" >&2; exit 1; }
awk -v s="$VPREF"  'BEGIN{exit !(s>=0.5 && s<=10)}'  || { echo "错误：-V 范围 0.5~10" >&2; exit 1; }
awk -v s="$TARGET" 'BEGIN{exit !(s>0)}'              || { echo "错误：-T 必须为正数" >&2; exit 1; }
for numv in "$FADE" "$OFFSET" "${CUT:-0}"; do
  awk -v x="$numv" 'BEGIN{exit !(x ~ /^-?[0-9]+(\.[0-9]+)?$/)}' \
    || { echo "错误：--offset/--cut/--fade 须为数字（秒，offset 可为负）" >&2; exit 1; }
done
awk -v f="$FADE" 'BEGIN{exit !(f>=0)}' || { echo "错误：--fade 不能为负" >&2; exit 1; }

# ── ffmpeg/ffprobe 探测：PATH → BBA_FFMPEG_DIR / 向上 4 层 tools/（encode.sh 同款风格）──
if ! command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG_CANDIDATES=()
  [ -n "${BBA_FFMPEG_DIR:-}" ] && FFMPEG_CANDIDATES+=("$BBA_FFMPEG_DIR")
  # 从首个视频所在目录向上（最多 4 层）探测 tools/，覆盖 <项目根>/<主题文件夹>/ 与 <项目根>/ 两种布局
  PROBE_DIR="$(cd "$(dirname "${VIDEOS[0]}")" 2>/dev/null && pwd || pwd)"
  for _ in 1 2 3 4; do
    FFMPEG_CANDIDATES+=("$PROBE_DIR/tools")
    [ "$PROBE_DIR" = "/" ] || [ "$PROBE_DIR" = "${PROBE_DIR%[\\/]*}" ] && break
    PROBE_DIR="${PROBE_DIR%[\\/]*}"
  done
  # 从脚本自身目录向上（最多 4 层）探测 tools/（覆盖 junction 路径调用的场景）
  PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
    echo "错误：未找到 ffmpeg/ffprobe（PATH、BBA_FFMPEG_DIR、向上 4 层 tools/ 均无）。可设置 BBA_FFMPEG_DIR 指向 ffmpeg 所在目录" >&2; exit 1
  fi
fi

# ── 通用函数 ──
fmt_dur() { awk -v d="$1" 'BEGIN{printf "%d:%02d", int(d/60), int(d)%60}'; }
probe_dur() { ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$1"; }
has_audio() { ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1" 2>/dev/null | head -1; }

# 输入校验·音频：必须存在、含音频流、时长为正；不合规打印日志说明缺什么、怎么补
check_audio() {
  local f=$1
  if [[ ! -f "$f" ]]; then
    echo "错误：音频文件不存在：$f" >&2
    echo "      请补充配乐文件，或用 -a <路径> 指定其他音频" >&2
    return 1
  fi
  if [[ -z "$(has_audio "$f")" ]]; then
    echo "错误：音频文件中没有音频流：$f" >&2
    echo "      请补充有效的配乐文件（mp3/wav 等）" >&2
    return 1
  fi
  if ! awk -v d="$(probe_dur "$f")" 'BEGIN{exit !(d>0)}'; then
    echo "错误：音频时长为 0 或无法读取：$f" >&2
    echo "      请补充有效的配乐文件" >&2
    return 1
  fi
  return 0
}

# 输入校验·视频：必须存在、含视频流、时长为正，且不能是本脚本的成品；不合规打印日志说明
check_video() {
  local f=$1
  if [[ ! -f "$f" ]]; then
    echo "  错误：原始视频不存在：$f" >&2
    echo "        请确认路径，或补充原始视频后重跑" >&2
    return 1
  fi
  local base=${f##*/}
  if [[ "$base" == *_"${TAG}".mp4 ]]; then
    echo "  错误：输入疑似本脚本成品（文件名以 _${TAG}.mp4 结尾）：$f" >&2
    echo "        请提供原始视频（未加配乐的成片）" >&2
    return 1
  fi
  if [[ -z "$(ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$f" 2>/dev/null | head -1)" ]]; then
    echo "  错误：找不到视频流（文件损坏或不是视频）：$f" >&2
    echo "        请补充有效的原始视频后重跑" >&2
    return 1
  fi
  if ! awk -v d="$(probe_dur "$f")" 'BEGIN{exit !(d>0)}'; then
    echo "  错误：视频时长为 0 或无法读取：$f" >&2
    echo "        请补充有效的原始视频后重跑" >&2
    return 1
  fi
  return 0
}

# atempo 单级范围 0.5~2.0，超 2.0 必须级联（3x = 2.0*1.5），自动拆级
atempo_chain() {
  local s=$1 chain=""
  while awk -v x="$s" 'BEGIN{exit !(x>2.0)}'; do
    chain+="${chain:+,}atempo=2.0"
    s=$(awk -v x="$s" 'BEGIN{printf "%.4f", x/2}')
  done
  chain+="${chain:+,}atempo=${s}"
  echo "$chain"
}

# 视频侧编码择路（贴点模式用）：探测源编码，h264/hevc 可零重编码 copy，其余回退重编码
video_codec_args() {
  local codec
  codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$1" 2>/dev/null | head -1)
  if [[ "$codec" == "h264" || "$codec" == "hevc" ]]; then
    echo "copy"
  else
    echo "reencode"
  fi
}

# 铺底模式：自动视频倍速 —— 以偏好倍速（-V，默认 3）起步；成片落进 50~60s 窗口就沿用，
# 否则算速把成片压到窗口中心（-T，默认 55s）。不低于 1x（不慢放），不高于 8x。
# 注意：-V 只是偏好，窗口护栏常开；要改产出时长用 -T。
auto_vspeed() {
  awk -v d="$1" -v p="$2" -v t="$TARGET" -v lo="$WIN_MIN" -v hi="$WIN_MAX" -v vmin="$AUTO_V_MIN" -v vmax="$AUTO_V_MAX" 'BEGIN{
    s = p; e = d / s;
    if (e > hi || e < lo) s = d / t;
    if (s < vmin) s = vmin;
    if (s > vmax) s = vmax;
    printf "%.4f", s;
  }'
}

# 收尾 fade：返回 st 与 d（截断点 c 前 fade 秒；不足则从 0 开始 fade 整段）
fade_st_d() { awk -v c="$1" -v f="$2" 'BEGIN{st=c-f; if(st<0)st=0; printf "%.3f %.3f", st, c-st}'; }

# ── 音频总备（两模式共用）──
check_audio "$AUDIO" || exit 1

a_dur=$(probe_dur "$AUDIO")
a_eff=$(awk -v d="$a_dur" -v s="$ASPEED" 'BEGIN{printf "%.2f", d/s}')
A_FILTER=$(atempo_chain "$ASPEED")

echo "== 音频：$(basename "$AUDIO")  总长 $(fmt_dur "$a_dur")  ${ASPEED}x 后 $(fmt_dur "$a_eff")（atempo 链：${A_FILTER}） =="

# 编码完成后的统一 ffmpeg 调用（视频参数已由调用方装入 V_ARGS/MAPS）
run_ffmpeg() {
  local out=$1 fc=$2; shift 2
  ffmpeg -y -hide_banner -loglevel error \
    -i "$video" -i "$AUDIO" \
    -filter_complex "$fc" \
    "$@" \
    -c:a aac -b:a 192k -movflags +faststart \
    "$out"
}

FAIL=0

# ═══════════════ 贴点模式（--align）═══════════════
if [[ $ALIGN -eq 1 ]]; then
  video="${VIDEOS[0]}"
  echo "== 贴点模式：画面优先，视频原样（B0 零渲染对齐） =="
  check_video "$video" || exit 1

  v_dur=$(probe_dur "$video")
  # --cut 默认=视频时长；超出则钳回（画面优先），提示选片尾之前的节拍
  if [[ -n "$CUT" ]] && ! awk -v c="$CUT" -v v="$v_dur" 'BEGIN{exit !(c<=v)}'; then
    echo "  提示：--cut ${CUT}s 超出视频时长 ${v_dur}s，已钳回（画面优先）；截断点建议选片尾之前的节拍"
  fi
  CUT_EFF=$(awk -v c="${CUT:-$v_dur}" -v v="$v_dur" 'BEGIN{printf "%.3f", (c>v ? v : c)}')
  if ! awk -v c="$CUT_EFF" 'BEGIN{exit !(c>0)}'; then
    echo "错误：截断点必须为正数" >&2; exit 1
  fi

  # 偏移：正=后移 adelay（毫秒），负=掐头 atrim（变速后坐标下掐掉开头 |offset| 秒）
  A_CHAIN="${A_FILTER}"
  OFF_NOTE="无偏移"
  if awk -v o="$OFFSET" 'BEGIN{exit !(o>0)}'; then
    OFF_MS=$(awk -v o="$OFFSET" 'BEGIN{printf "%d", int(o*1000+0.5)}')
    A_CHAIN+=",adelay=${OFF_MS}:all=1"
    OFF_NOTE="后移 ${OFFSET}s（adelay）"
  elif awk -v o="$OFFSET" 'BEGIN{exit !(o<0)}'; then
    TRIM_HEAD=$(awk -v o="$OFFSET" 'BEGIN{printf "%.3f", -o}')
    A_CHAIN+=",atrim=start=${TRIM_HEAD}"
    OFF_NOTE="掐头 ${TRIM_HEAD}s（atrim）"
  fi
  A_CHAIN+=",apad,atrim=0:${CUT_EFF},asetpts=PTS-STARTPTS"

  read -r FADE_ST FADE_D <<< "$(fade_st_d "$CUT_EFF" "$FADE")"

  # 音频够不够到截断点
  if awk -v a="$a_eff" -v o="$OFFSET" -v c="$CUT_EFF" 'BEGIN{exit !(a+o>=c)}'; then
    COVER="BGM 覆盖至截断点"
  else
    COVER="BGM 不足，结尾静音补齐"
  fi

  # 视频编码择路：h264/hevc 直接 -c:v copy 零重编码，否则回退 libx264
  V_ARGS=(); V_NOTE=""
  if [[ "$(video_codec_args "$video")" == "copy" ]]; then
    V_ARGS=(-c:v copy)
    V_NOTE="-c:v copy 零重编码"
  else
    V_ARGS=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p)
    V_NOTE="源非 h264/hevc，回退 libx264 重编码"
  fi

  vdir=$(dirname "$video"); vbase=$(basename "$video"); vname="${vbase%.*}"
  if [[ -n "$OUTPUT_NAME" ]]; then out="$vdir/$OUTPUT_NAME"; else out="$vdir/${vname}_${TAG}.mp4"; fi
  if [[ -e "$out" ]]; then echo "跳过（输出已存在，防覆盖）：$out" >&2; exit 1; fi

  echo "处理：$video"
  echo "  画面：原样 $(fmt_dur "$v_dur")（${V_NOTE}）"
  echo "  音频：${ASPEED}x → ${OFF_NOTE} → 截至 ${CUT_EFF}s → fade out ${FADE_D}s（${COVER}）"

  HAS_TR=$(has_audio "$video")
  if [[ $KEEP_AUDIO -eq 1 && -n "$HAS_TR" ]]; then
    # 保留原音轨（贴点模式画面不动，原声无需变速），amix normalize=0，收尾 fade 连原声一起
    MIX="[na][oa]amix=inputs=2:duration=first:dropout_transition=0:normalize=0"
    if awk -v d="$FADE_D" 'BEGIN{exit !(d>0.001)}'; then
      FC="[1:a]${A_CHAIN}[na];[0:a]apad,atrim=0:${CUT_EFF},asetpts=PTS-STARTPTS[oa];${MIX}[mix];[mix]afade=t=out:st=${FADE_ST}:d=${FADE_D}[a]"
    else
      FC="[1:a]${A_CHAIN}[na];[0:a]apad,atrim=0:${CUT_EFF},asetpts=PTS-STARTPTS[oa];${MIX}[a]"
    fi
  else
    [[ $KEEP_AUDIO -eq 1 ]] && echo "  提示：视频无原音轨，--keep-audio 忽略，直接加 BGM 轨"
    if awk -v d="$FADE_D" 'BEGIN{exit !(d>0.001)}'; then
      FC="[1:a]${A_CHAIN},afade=t=out:st=${FADE_ST}:d=${FADE_D}[a]"
    else
      FC="[1:a]${A_CHAIN}[a]"
    fi
  fi

  if run_ffmpeg "$out" "$FC" -map 0:v -map "[a]" "${V_ARGS[@]}"; then
    echo "  完成：$out（$(fmt_dur "$(probe_dur "$out")")）—— B0 验听版，人耳确认后再决定是否升级 B1"
  else
    echo "  失败：$video" >&2; rm -f "$out"; exit 1
  fi
  exit 0
fi

# ═══════════════ 铺底模式（默认，兼容项目版用法）═══════════════
echo "== 视频倍速：偏好 ${VPREF}x（窗口护栏 ${WIN_MIN}s~${WIN_MAX}s 常开，落不进会自动调速至 ${TARGET}s） =="

SKIPPED=()
for video in "${VIDEOS[@]}"; do
  echo
  if ! check_video "$video"; then SKIPPED+=("$video"); FAIL=1; continue; fi

  vdir=$(dirname "$video"); vbase=$(basename "$video"); vname="${vbase%.*}"
  if [[ -n "$OUTPUT_NAME" && ${#VIDEOS[@]} -eq 1 ]]; then
    out="$vdir/$OUTPUT_NAME"
  else
    out="$vdir/${vname}_${TAG}.mp4"
  fi
  if [[ -e "$out" ]]; then echo "跳过（输出已存在，防覆盖）：$out" >&2; FAIL=1; continue; fi

  v_dur=$(probe_dur "$video")
  vspeed=$(auto_vspeed "$v_dur" "$VPREF")
  v_eff=$(awk -v d="$v_dur" -v s="$vspeed" 'BEGIN{printf "%.3f", d/s}')

  note="音频截断至 $(fmt_dur "$v_eff")"
  awk -v a="$a_eff" -v v="$v_eff" 'BEGIN{exit !(a<v)}' && note="音频不足，结尾静音补齐"

  # 收尾 fade（--fade 0 可复刻项目版硬切）
  read -r FADE_ST FADE_D <<< "$(fade_st_d "$v_eff" "$FADE")"

  # 视频编码择路：1x 无需变速 → 零重编码；否则 setpts 变速 + libx264
  V_FILTER=""; V_ARGS=(); MAPS=()
  if awk -v x="$vspeed" 'BEGIN{exit !(x==1)}'; then
    V_ARGS=(-c:v copy); MAPS=(-map 0:v)
    VS_NOTE="1x 零重编码（-c:v copy）"
  else
    V_FILTER="[0:v]setpts=PTS/${vspeed},fps=24[v];"
    V_ARGS=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p)
    MAPS=(-map "[v]")
    VS_NOTE="$(fmt_dur "$v_dur") --${vspeed}x--> $(fmt_dur "$v_eff")"
  fi

  echo "处理：$video"
  echo "  画面：${VS_NOTE}；音频 ${ASPEED}x 后 $(fmt_dur "$a_eff")（$note）"

  # 窗口提示：原片太短未慢放 / 倍速触顶仍超窗
  awk -v v="$v_eff" -v lo="$WIN_MIN" 'BEGIN{exit !(v<lo)}' && echo "  提示：成片短于 ${WIN_MIN}s（原片本身不足，未慢放）"
  awk -v v="$v_eff" -v hi="$WIN_MAX" 'BEGIN{exit !(v>hi)}' && echo "  提示：成片仍超 ${WIN_MAX}s（倍速已触 ${AUTO_V_MAX}x 上限）"

  HAS_TR=$(has_audio "$video")
  # 原音轨变速链（铺底模式原声随画面同倍速；1x 时无需变速）
  VA_CHAIN=""
  if [[ -n "$HAS_TR" ]] && ! awk -v x="$vspeed" 'BEGIN{exit !(x==1)}'; then
    VA_CHAIN="$(atempo_chain "$vspeed"),"
  fi

  if [[ $KEEP_AUDIO -eq 1 && -n "$HAS_TR" ]]; then
    # 保留原音轨混音：amix 必须 normalize=0；收尾 fade 连原声一起
    MIX="[na][oa]amix=inputs=2:duration=first:dropout_transition=0:normalize=0"
    if awk -v d="$FADE_D" 'BEGIN{exit !(d>0.001)}'; then
      FC="${V_FILTER}[1:a]${A_FILTER},apad,atrim=0:${v_eff},asetpts=PTS-STARTPTS[na];[0:a]${VA_CHAIN}apad,atrim=0:${v_eff},asetpts=PTS-STARTPTS[oa];${MIX}[mix];[mix]afade=t=out:st=${FADE_ST}:d=${FADE_D}[a]"
    else
      FC="${V_FILTER}[1:a]${A_FILTER},apad,atrim=0:${v_eff},asetpts=PTS-STARTPTS[na];[0:a]${VA_CHAIN}apad,atrim=0:${v_eff},asetpts=PTS-STARTPTS[oa];${MIX}[a]"
    fi
  else
    [[ $KEEP_AUDIO -eq 1 && -z "$HAS_TR" ]] && echo "  提示：视频无原音轨，--keep-audio 忽略，直接加 BGM 轨"
    [[ -n "$HAS_TR" ]] && echo "  原音轨：丢弃换新 BGM（--keep-audio 可保留混音）"
    if awk -v d="$FADE_D" 'BEGIN{exit !(d>0.001)}'; then
      FC="${V_FILTER}[1:a]${A_FILTER},apad,atrim=0:${v_eff},afade=t=out:st=${FADE_ST}:d=${FADE_D},asetpts=PTS-STARTPTS[a]"
    else
      FC="${V_FILTER}[1:a]${A_FILTER},apad,atrim=0:${v_eff},asetpts=PTS-STARTPTS[a]"
    fi
  fi

  if run_ffmpeg "$out" "$FC" "${MAPS[@]}" -map "[a]" "${V_ARGS[@]}"; then
    echo "  完成：$out（$(fmt_dur "$(probe_dur "$out")")）"
  else
    echo "  失败：$video" >&2; rm -f "$out"; FAIL=1
  fi
done

echo
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "以下输入不合规，已跳过，请补充后重跑："
  for s in "${SKIPPED[@]}"; do echo "  - $s"; done
fi
[[ $FAIL -eq 0 ]] && echo "全部完成。" || echo "存在失败/跳过项，见上方日志。"
exit $FAIL
