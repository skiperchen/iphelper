#!/usr/bin/env python3
"""创建 GitHub Release 并上传 v1.0.6 的安装包。

用法: GH_RELEASE_TOKEN=<token> python3 publish_release.py
需要权限: repo (创建 release + 上传 asset)
"""
import json, os, sys, ssl, urllib.request, urllib.error

REPO = "skiperchen/iphelper"
TAG = "v1.0.6"
ASSETS = [
    "dist/IPHelper-1.0.6-mac.zip",
    "dist/IPHelper-1.0.6-arm64-mac.zip",
]

def api(url, method="GET", data=None, headers=None, token=None, raw=False, timeout=60):
    h = {"Accept": "application/vnd.github+json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    body = data
    if isinstance(data, (dict, list)):
        body = json.dumps(data).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            return r.status, (r.read() if raw else r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def main():
    token = os.environ.get("GH_RELEASE_TOKEN", "").strip()
    if not token:
        print("错误: 请设置 GH_RELEASE_TOKEN 环境变量")
        sys.exit(1)

    # 1. 创建 release
    code, body = api(
        f"https://api.github.com/repos/{REPO}/releases", "POST",
        {"tag_name": TAG, "name": TAG,
         "body": "v1.0.6 新增: 独立 DNS 管理面板 —— 读取当前网卡 DNS、写入静态 DNS、一键恢复自动"},
        token=token)
    if code in (200, 201):
        rel = json.loads(body)
        rel_id = rel["id"]
        print(f"✅ Release 已创建: {rel['html_url']} (id={rel_id})")
    elif code == 422 and "already_exists" in body:
        print("⚠️ Release 已存在，复用现有")
        code, body = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}", token=token)
        rel_id = json.loads(body)["id"]
    else:
        print(f"❌ 创建 Release 失败 {code}: {body}")
        sys.exit(1)

    # 2. 上传 assets (content-type=application/zip, accept=json)
    for asset_path in ASSETS:
        fname = os.path.basename(asset_path)
        if not os.path.exists(asset_path):
            print(f"⚠️ 文件不存在跳过: {asset_path}")
            continue
        with open(asset_path, "rb") as f:
            code, resp = api(
                f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={fname}",
                "POST", data=f.read(), raw=True,
                headers={"Content-Type": "application/zip"}, token=token, timeout=300)
        if code in (200, 201):
            print(f"✅ 上传成功: {fname}")
        else:
            print(f"❌ 上传失败 {fname} ({code}): {resp[:300]}")

if __name__ == "__main__":
    main()
