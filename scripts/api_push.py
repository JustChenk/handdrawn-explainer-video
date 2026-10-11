#!/usr/bin/env python3
"""
api_push.py —— 通过 GitHub REST API 推送本地目录（git HTTPS 不可达时的替代方案）

背景：CodeBuddy 沙箱内 git 的 HTTPS 通道（github.com:443）会被阻断（连接挂起超时），
但 api.github.com 通过 curl/requests 可正常访问。此时用 Git Data API 完成推送。

用法（4 个参数均可省略，有默认值）：
  export GH_TOKEN=github_pat_xxx
  python3 api_push.py [--repo OWNER/REPO] [--dir /path/to/local] [--branch main] [--message "..."]

行为：
  - 仓库为空  -> 先用 Contents API 建首个 commit（Git Data API 对空仓库报 409）
  - 分支存在  -> force 更新到新 commit（以本地文件为准，慎用于有协作者的仓库）
  - 分支不存在-> 创建分支
"""
import argparse, base64, os, requests

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="JustChenk/handdrawn-explainer-video")
    ap.add_argument("--dir", default="/root/.codebuddy/skills/handdrawn-explainer-video")
    ap.add_argument("--branch", default="main")
    ap.add_argument("--message", default="sync from sandbox via API")
    args = ap.parse_args()

    TOKEN = os.environ.get("GH_TOKEN")
    if not TOKEN:
        sys_exit("缺少环境变量 GH_TOKEN")
    API = f"https://api.github.com/repos/{args.repo}"
    H = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"}
    s = requests.Session(); s.headers.update(H)

    # 收集文件（排除 .git / node_modules / 渲染产物）
    EXCLUDE_DIRS = {".git", "node_modules", "frames", "testframes", "__pycache__"}
    EXCLUDE_EXT = {".jpg", ".png", ".mp4", ".pyc"}
    files = []
    for root, dirs, names in os.walk(args.dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for n in names:
            p = os.path.join(root, n)
            rel = os.path.relpath(p, args.dir).replace(os.sep, "/")
            if os.path.splitext(n)[1] not in EXCLUDE_EXT:
                files.append(rel)
    if not files:
        sys_exit("目录中没有可推送的文件")
    print(f"待推送 {len(files)} 个文件 -> {args.repo} ({args.branch})")

    # 1. 检查分支
    r = s.get(f"{API}/git/ref/heads/{args.branch}")
    ref_exists = (r.status_code == 200)
    base_tree, parents = None, []

    # 2. 空仓库：先建首个 commit（否则 blobs 会 409）
    if not ref_exists:
        probe = "README.md" if "README.md" in files else files[0]
        with open(os.path.join(args.dir, probe), "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        r = s.put(f"{API}/contents/{probe}",
                  json={"message": "chore: init repo", "content": b64, "branch": args.branch})
        r.raise_for_status()
        files.remove(probe)
        print(f"init commit ok ({probe})")

    # 3. 读取现有 commit（作为父提交）
    r = s.get(f"{API}/git/ref/heads/{args.branch}")
    if r.status_code == 200:
        sha = r.json()["object"]["sha"]
        c = s.get(f"{API}/git/commits/{sha}").json()
        base_tree, parents = c["tree"]["sha"], [sha]

    # 4. 上传 blobs
    tree_items = []
    for path in files:
        with open(os.path.join(args.dir, path), "rb") as f:
            content = base64.b64encode(f.read()).decode()
        r = s.post(f"{API}/git/blobs", json={"content": content, "encoding": "base64"})
        r.raise_for_status()
        tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": r.json()["sha"]})
        print("blob ok:", path)

    # 5. 建 tree + commit
    r = s.post(f"{API}/git/trees", json={"base_tree": base_tree, "tree": tree_items})
    r.raise_for_status()
    tree_sha = r.json()["sha"]
    r = s.post(f"{API}/git/commits", json={"message": args.message, "tree": tree_sha, "parents": parents})
    r.raise_for_status()
    commit_sha = r.json()["sha"]

    # 6. 更新/创建分支（ref 状态可能已变，必须重新查询，避免 422）
    r = s.get(f"{API}/git/ref/heads/{args.branch}")
    if r.status_code == 200:
        r = s.patch(f"{API}/git/refs/heads/{args.branch}", json={"sha": commit_sha, "force": True})
    else:
        r = s.post(f"{API}/git/refs", json={"ref": f"refs/heads/{args.branch}", "sha": commit_sha})
    r.raise_for_status()
    print(f"PUSHED -> https://github.com/{args.repo}/commit/{commit_sha}")

def sys_exit(msg):
    print("ERROR:", msg); raise SystemExit(1)

if __name__ == "__main__":
    main()
