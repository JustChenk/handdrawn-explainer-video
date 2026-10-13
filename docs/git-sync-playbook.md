# 沙箱环境 Git 同步 GitHub：踩坑与解决方法

> 记录 2026-10-11 将 `handdrawn-explainer-video` skill 推送到 GitHub 时遇到的问题与最终解法（2026-10-13 该仓库演化为 [vibe-video-skills](https://github.com/JustChenk/vibe-video-skills) 合集仓库），供以后推送任何项目时直接套用，避免反复试错。
> 配套脚本：`<repo>/scripts/api_push.py`（本仓库根目录，已验证可用）

---

## 0. 快速决策树（下次先看这个）

```
要推送 GitHub
 ├─ 能正常 git clone/pull/push 吗？
 │   └─ 测试: timeout 25 git ls-remote https://github.com/OWNER/REPO.git HEAD
 │        ├─ 10 秒内返回 SHA → 走正常 git push（用 https://x-access-token:<PAT>@github.com/... 一次性 URL）
 │        └─ 挂起/超时 → 【本沙箱常态】直接放弃 git，走 API 方案 ↓
 ├─ API 方案（已验证可行）
 │   └─ curl -s -H "Authorization: Bearer $PAT" https://api.github.com/repos/OWNER/REPO
 │        ├─ 200 → 用 api_push.py 一键推送
 │        └─ 404 → 先用 API 创建仓库: POST https://api.github.com/user/repos
 └─ 推完务必校验：GET /git/trees/main?recursive=1 核对文件数与大小
```

## 1. 环境事实（本次实测结论）

| 通道 | 结果 | 说明 |
|---|---|---|
| `curl https://api.github.com` | ✅ 200，<1s | API 全部走这里 |
| `curl https://github.com` | ✅ 200，1.4s（IPv4 20.205.243.166） | 仅 curl 可用 |
| `git ls-remote / push https://github.com/...` | ❌ 连接挂起，136s 超时 | git 的 HTTPS 被阻断 |
| hosts 固定 IPv4 + `http.version=HTTP/1.1` | ❌ 仍超时 | 换协议/换 IP 都救不了，是链路层拦截 |
| SSH (git@github.com) | ❌ 沙箱无私钥 | 保留 remote 配置给本地机器用即可 |

**结论：在本沙箱内，凡是要和 GitHub 传数据，直接用 REST API（requests/curl），不要再试 git push。**

注意：`git push` 超时会挂 2 分钟以上，前台命令会被强制转后台——先用 `timeout 25 git ls-remote ...` 做 25 秒快速探测，别直接 push 试错。

## 2. 认证方式

- Token 校验 + 仓库探测一步完成：
  ```bash
  curl -s -o /tmp/check.json -w "%{http_code}" \
    -H "Authorization: Bearer $PAT" \
    https://api.github.com/repos/OWNER/REPO
  # 200=存在且 token 有效；401=token 无效；404=仓库不存在(或无权限)
  ```
- **不要**把 PAT 写进 `.git/config` 或任何落盘文件（`git remote add origin https://TOKEN@...` 会把 token 明文存进 config）；push 时用一次性 URL，或干脆走 API。
- 输出日志时用 `sed 's/x-access-token:[^@]*@/x-access-token:***@/'` 脱敏。
- token 在对话/聊天中明文出现过 → 提醒用户到 GitHub → Settings → Developer settings 撤销轮换。

## 3. API 推送的三个坑（脚本已内置规避）

### 坑① 空仓库创建 blob 报 409 Conflict
- 现象：`POST /git/blobs` 直接 409（Git Repository is empty）。
- 解法：先用 **Contents API** 塞入第一个文件建立初始 commit：
  ```bash
  PUT /repos/OWNER/REPO/contents/README.md
  {"message":"chore: init repo","content":"<base64>","branch":"main"}
  ```
- 之后 Git Data API 全部可用。

### 坑② 分支 ref 已存在时 POST /git/refs 报 422
- 现象：脚本开头判断"分支不存在"，但流程中途（init commit）已经把 main 创建出来了，末尾再 `POST /git/refs` → 422 Unprocessable Entity。
- 解法：**创建/更新 ref 前必须重新 GET 一次 ref 状态**，存在用 `PATCH /git/refs/heads/main`（force），不存在才 `POST /git/refs`。

### 坑③ 更新已有仓库时丢历史
- 直接 force PATCH ref 会覆盖远程提交。有协作者/有保护分支的仓库慎用。
- 更安全的增量做法：先 GET 最新 commit sha 作为 parent，`base_tree` 也从它取，普通 commit 即可（api_push.py 已按此实现；force 仅作为兜底参数保留）。

## 4. 正确姿势的完整流程（api_push.py 已实现）

```
1. GET  /repos/{o}/{r}/git/ref/heads/main            → 分支是否存在
2. 空仓库: PUT /contents/README.md                   → 建首个 commit
3. POST /git/blobs (逐文件, content=base64)          → 上传内容
4. POST /git/trees  (base_tree=现有 tree, tree=blobs)→ 构建目录树
5. POST /git/commits (parents=[现有 commit])         → 创建提交
6. 重新 GET ref → PATCH(存在)/POST(不存在) refs      → 移动分支
```

一键使用：
```bash
export GH_TOKEN=github_pat_xxx
python3 <repo>/scripts/api_push.py \
  --repo OWNER/REPO --dir /path/to/dir --branch main --message "sync"
```
- 自动排除 `.git/node_modules/frames/*.jpg/*.mp4` 等
- 限制：单文件 <100MB；推送后必须校验（见下）

## 5. 推送后校验（不要省略）

```bash
curl -s -H "Authorization: Bearer $PAT" \
  "https://api.github.com/repos/OWNER/REPO/git/trees/main?recursive=1" \
  | python3 -m json.tool | grep -E '"path"|"size"'
# 核对：文件数量、每个文件大小与本地一致、truncated=false
```

## 6. 其他注意

- **git 身份**：沙箱首次 commit 前需 `git config user.name/email`（全局或仓库级）。
- **大文件**：ttf/二进制走 API base64 没问题（本次最大 1.5MB）；>50MB 应考虑 Git LFS 或 release 附件。
- **本地与远程历史对齐**：API 产生的 commit 与本地 git 提交历史不同源，在有正常网络的机器上执行：
  ```bash
  git fetch origin && git reset --hard origin/main
  ```
  之后即可恢复正常 git 增量推送。
- **remote 命名**：`git remote add origin git@github.com:OWNER/REPO.git`（保留 SSH 形式给本地机器），沙箱内不要用 `https://TOKEN@` 形式添加 remote，防 token 落盘。
