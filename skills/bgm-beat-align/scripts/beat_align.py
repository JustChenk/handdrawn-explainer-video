# -*- coding: utf-8 -*-
"""
beat_align.py — BGM 节拍分析与视频幕边界卡点对齐（bgm-beat-align skill 主工具）

用途：给成片配 BGM 前，先量化"卡点"——输出 BPM/节拍网格/能量轮廓，
并把视频幕边界放到变速后的节拍网格上量偏差，给出微调帧数与截断点建议。

用法（依赖 librosa，首次先 `python -m pip install librosa`）:
  python beat_align.py <音频文件> [--scenes 0,5,18,30,41,51,62,74] [--speed 1.5] [--json out.json]

示例:
  python beat_align.py assets/We_Never.mp3 --scenes 0,5,18,30,41,51,62,74 --speed 1.5 --json tmp/beats.json

注意:
  - --speed 必须与实际合成时的 atempo 完全一致（默认 1.5），否则全盘错位
  - 贴点阈值依据人耳对音画偏差的感知阈值约 50~100ms（ON_BEAT/NEAR_BEAT 常量）
  - 方法论（A/B/C 板决策树、B0/B1 执行深度）见同目录上级的 SKILL.md
"""
import argparse
import json
import sys

import numpy as np
import librosa

# 贴点判断阈值（秒）。依据：人耳对音画偏差的感知阈值约 50~100ms
ON_BEAT = 0.08      # ≤2 帧（24fps）：视为已在拍上
NEAR_BEAT = 0.12    # ≤3 帧：微调 1-2 帧即完美


def analyze(audio_path, speed):
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = float(len(y) / sr)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    tempo = float(np.atleast_1d(tempo)[0])  # 新版 librosa 返回数组
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    # 能量轮廓（2s 一桶的 RMS），识别 intro/drop/quiet 段
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    nb = int(np.ceil(duration / 2.0))
    energy = []
    for b in range(nb):
        m = (rms_times >= b * 2.0) & (rms_times < (b + 1) * 2.0)
        energy.append(float(rms[m].mean()) if m.any() else 0.0)

    return {
        "file": audio_path,
        "duration_1x": duration,
        "duration_spd": duration / speed,
        "tempo_bpm": tempo,
        "n_beats": int(len(beat_times)),
        "beat_interval_1x": float(np.mean(np.diff(beat_times))) if len(beat_times) > 2 else None,
        "beats_1x": [round(float(t), 3) for t in beat_times],
        "beats_spd": [round(float(t) / speed, 3) for t in beat_times],
        "energy_profile_2s": [round(e, 5) for e in energy],
        "speed": speed,
    }


def report(data, scenes):
    """打印对齐报告：每幕边界 vs 变速后最近节拍"""
    beats = data["beats_spd"]
    speed = data["speed"]
    print("=" * 78)
    print(f"音乐 {speed}x 时长 {data['duration_spd']:.2f}s | BPM≈{data['tempo_bpm']:.1f}"
          f" | {speed}x 拍间隔≈{(data['beat_interval_1x'] or 0)/speed:.3f}s")
    print("=" * 78)
    print(f"{'边界':>10}{'视频时刻':>10}{'最近拍':>10}{'偏差':>9}{'帧数':>6}  判断")
    tweaks = []
    for t in scenes:
        b = min(beats, key=lambda x: abs(x - t))
        d = b - t
        frames = round(abs(d) * 24)
        if abs(d) <= ON_BEAT:
            verdict = "已在拍上 OK"
        elif abs(d) <= NEAR_BEAT:
            verdict = "微调 1-2 帧"
        else:
            verdict = "需调整"
            tweaks.append((t, b, frames, d))
        print(f"{'':>10}{t:>9.1f}s{b:>9.3f}s{d:>+9.3f}{frames:>6}  {verdict}")

    if tweaks:
        print()
        print("— 微调建议（改 scenes.js 幕边界 -> 节拍时刻，秒×24=帧）—")
        for t, b, frames, d in tweaks:
            print(f"  {t:>6.1f}s -> {b:.3f}s ({round(d*24):+d} 帧, {d*1000:+.0f}ms)")

    # 逐段拍密度
    if len(scenes) >= 2:
        bar = 4 * (data["beat_interval_1x"] or 0.4) / speed
        print()
        print("— 逐段节拍密度 —")
        for i in range(len(scenes) - 1):
            t0, t1 = scenes[i], scenes[i + 1]
            n = len([b for b in beats if t0 <= b < t1])
            dur = t1 - t0
            print(f"  {t0:>5.1f}-{t1:>5.1f}s ({dur:>4.1f}s) | 拍数 {n:>3} | 小节≈{dur/bar:4.1f} | 密度 {n/dur:.1f} 拍/s")

    # 截断点建议：末边界之后的第一个拍
    if scenes:
        end = scenes[-1]
        after = [b for b in beats if b >= end - 0.5]
        if after:
            cut = min(after, key=lambda x: abs(x - end))
            print()
            print(f"— 音频截断点建议：{cut:.3f}s（视频末边界 {end:.1f}s 的最近拍，偏差 {cut-end:+.3f}s）—")
            print(f"  合成命令模板（-c:v copy 零重编码）:")
            print(f"  ffmpeg -i <视频> -i <音频> -filter_complex \"[1:a]atempo={speed},atrim=0:{cut:.3f},"
                  f"afade=t=out:st={cut-0.5:.3f}:d=0.5[a]\" -map 0:v -map \"[a]\" -c:v copy -c:a aac -b:a 192k <输出>")


def main():
    ap = argparse.ArgumentParser(description="BGM 节拍分析与幕边界卡点对齐")
    ap.add_argument("audio", help="音频文件路径")
    ap.add_argument("--scenes", default="", help="视频幕边界列表（秒，逗号分隔），如 0,5,18,30,41,51,62,74")
    ap.add_argument("--speed", type=float, default=1.5, help="音频变速倍率（atempo 变速不变调），默认 1.5")
    ap.add_argument("--json", default="", help="可选：完整数据落盘 JSON 路径")
    args = ap.parse_args()

    data = analyze(args.audio, args.speed)
    print(f"BPM≈{data['tempo_bpm']:.1f} | 时长 1x={data['duration_1x']:.1f}s {args.speed}x={data['duration_spd']:.1f}s"
          f" | 节拍数={data['n_beats']}")
    mx = max(data["energy_profile_2s"]) or 1
    line = "".join("#" if e > mx * 0.66 else ("+" if e > mx * 0.33 else ".") for e in data["energy_profile_2s"])
    print("能量轮廓(2s/桶):")
    for i in range(0, len(line), 60):
        print(f"  {i*2:4d}s |{line[i:i+60]}|")

    if args.scenes:
        scenes = [float(x) for x in args.scenes.split(",") if x.strip()]
        report(data, scenes)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print(f"\n完整数据已写入 {args.json}")


if __name__ == "__main__":
    sys.exit(main())
