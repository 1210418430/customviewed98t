# 论坛小脚本 - 全能看帖与提取辅助

> Tampermonkey 油猴脚本，运行在 sehuatang.net 论坛，提供无缝翻页、资源提取、115网盘离线下载等功能。

## 版本

当前版本：**v14.0**

## 功能概览

| 模块 | 功能 | 说明 |
|------|------|------|
| **无缝翻页** | 自动加载下一页 | 滚动到底部自动加载，可设置开关 |
| **悬浮预览** | 鼠标悬停预览图片 | 帖子标题悬停 500ms 后显示缩略图 |
| **资源提取** | 批量提取帖子内容 | 图片、磁力、ed2k、种子、TXT、压缩包 |
| **图片灯箱** | 点击图片放大预览 | 三区域点击（上一张/关闭/下一张），键盘左右切换 |
| **屏蔽/高亮** | 关键词和用户屏蔽 | 支持标题关键词、用户名、UID 屏蔽 |
| **已读记忆** | 标记已浏览帖子 | 持久化存储，最多 1000 条 |
| **隐藏内容** | 检测需回复可见内容 | 提供回复按钮 + 刷新查看 |
| **种子转磁力** | .torrent → magnet | 内置 bencode 解析 + SHA-1 哈希 |
| **TXT/ZIP 解压** | 提取文本内容 | 内联 ZIP 读取器（DecompressionStream）+ JSZip 后备 |
| **115 离线下载** | 推送链接到 115 网盘 | 支持磁力/ed2k/直链，目录选择器，常用目录收藏 |
| **帖子详情页** | 内联展示 TXT/ZIP | 页面顶部汇总 + 每个链接下方内联展示 |

## 文件结构

```
brower.js          — 主脚本（全部功能，约 2100 行）
README.md          — 本文件
```

## 配置项（STATE）

### 基础配置

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `custom_blocked_keywords` | `[]` | 屏蔽标题关键词列表 |
| `custom_blocked_users` | `[]` | 屏蔽用户（用户名或 UID） |
| `custom_highlight_keywords` | `[]` | 高亮标题关键词列表 |
| `custom_read_links` | `[]` | 已读帖子 URL（最多 1000） |
| `custom_auto_load` | `false` | 无缝翻页开关 |
| `custom_auto_extract` | `true` | 启动时自动全选并提取 |
| `custom_image_count` | `2` | 提取图片数量（1-10） |
| `custom_image_size` | `120px` | 图片显示高度 |
| `custom_concurrent_enabled` | `false` | 并发加载开关 |
| `custom_concurrent_count` | `3` | 同时处理个数（1-10） |
| `custom_concurrent_delay` | `600` | 批次间隔时间（ms） |

### 115 离线下载配置

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `offline_115_cid` | `'0'` | 离线保存目录 CID |
| `offline_115_cid_name` | `'根目录'` | 目录显示名 |
| `offline_115_auto_open` | `false` | 启动时展开 115 面板 |
| `offline_115_favorites` | `[]` | 常用目录列表 `[{cid, name}]` |
| `offline_115_fav_max` | `5` | 常用目录最大显示数量 |
| `offline_115_new_folder` | `''` | 新建文件夹名（持久化） |
| `offline_115_urls` | `''` | 离线链接内容（持久化） |

## 115 网盘 API

| 操作 | 端点 | 方法 |
|------|------|------|
| 获取认证 | `https://115.com/?ct=offline&ac=space` | GET |
| 推送单条 | `https://115.com/web/lixian/?ct=lixian&ac=add_task_url` | POST |
| 创建文件夹 | `https://webapi.115.com/files/add` | POST |
| 列出文件夹 | `https://webapi.115.com/files?aid=1&cid={cid}&show_dir=1&format=json` | GET |

推送请求体：`uid={uid}&sign={sign}&time={time}&wp_path_id={cid}&url={encoded_url}`

## 内联 ZIP 读取器

不依赖外部库，使用浏览器内置 `DecompressionStream` API：

1. 倒序查找 EOCD（PK\x05\x06），定位中央目录
2. 遍历中央目录条目，收集 .txt 文件的准确元数据（compSize 永远准确）
3. 根据 localOff 定位数据，用 deflate-raw 解压

支持：stored（无压缩）、deflate（压缩）。不支持的格式自动回退到 JSZip。

## 种子转磁力

1. 下载 .torrent 文件
2. bencode 解析，定位 info 字典的原始字节范围
3. SHA-1 哈希 info 原始字节 → `magnet:?xt=urn:btih:<HASH>`

## 依赖

| 库 | 用途 | 加载方式 |
|----|------|----------|
| JSZip | ZIP 解压后备 | `@require` 本地缓存 + CDN 动态加载 |

## 浏览器兼容

- Chrome 80+（需要 `DecompressionStream` API）
- Tampermonkey 扩展

## 变更日志

### v14.0
- 115 离线下载：内联推送按钮（帖子列表 + 详情页）
- 一键推送全部链接
- 推送日志同步到 115 面板
- 帖子详情页：TXT/ZIP 内联展示 + 顶部汇总 + 推送功能

### v13.1
- 115 离线下载面板：目录选择器、常用目录收藏、输入框持久化
- 帖子详情页：内联 TXT/ZIP 内容展示
- 常用目录滚动显示修复
- 文件夹已存在时自动查找 CID
- 清除按钮（新建文件夹、离线链接）

### v13.0
- 115 离线下载基础功能：推送、创建文件夹、目录选择器
- 种子转磁力链接
- 内联 ZIP 读取器（零外部依赖）
- GM_xmlhttpRequest 绕过 CORS
- 多 CDN 容灾加载 JSZip

### v12.0
- 图片灯箱预览（三区域点击 + 键盘操作）
- 并发加载模式
- 启动时自动全选并提取
- 隐藏内容检测（需回复可见）
- ED2K 链接提取
- TXT 文件内容提取
- ZIP 压缩包解压提取

### v11.0
- 无缝翻页
- 悬浮预览
- 关键词/用户屏蔽
- 高亮标题关键词
- 已读记忆
