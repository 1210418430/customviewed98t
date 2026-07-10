// ==UserScript==
// @name         论坛小脚本-全能看帖与提取辅助
// @namespace    http://tampermonkey.net/
// @version      14.0
// @description  无缝翻页、悬浮预览、资源提取、屏蔽高亮关键词、按用户/UID屏蔽、已读记忆、修复复制Bug、115离线下载
// @author       鲜切红薯片
//
// 【维护规则】每次功能变更后，必须同步更新项目根目录的 README.md 文件。
// README.md 是项目的核心文档，供开发者和 AI 工具快速了解项目架构和功能。
// 更新内容包括：功能列表、配置项、API 说明、变更日志等。
// @match        *://sehuatang.net/*
// @match        *://*.sehuatang.net/*
// @match        *://sehuatang.org/*
// @match        *://127.0.0.1:20000/*
// @match        *://*.127.0.0.1:20000/*
// @match        *://*.sehuatang.org/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://lib.baomitu.com/jszip/3.10.1/jszip.min.js
// @downloadURL https://update.sleazyfork.org/scripts/568616/%E8%AE%BA%E5%9D%9B%E5%B0%8F%E8%84%9A%E6%9C%AC-%E5%85%A8%E8%83%BD%E7%9C%8B%E5%B8%96%E4%B8%8E%E6%8F%90%E5%8F%96%E8%BE%85%E5%8A%A9.user.js
// @updateURL https://update.sleazyfork.org/scripts/568616/%E8%AE%BA%E5%9D%9B%E5%B0%8F%E8%84%9A%E6%9C%AC-%E5%85%A8%E8%83%BD%E7%9C%8B%E5%B8%96%E4%B8%8E%E6%8F%90%E5%8F%96%E8%BE%85%E5%8A%A9.meta.js
// ==/UserScript==

(function() {
    'use strict';

    if (!document.body) return;

    // ================= 配置与状态 =================
    const STATE = {
        blocked: GM_getValue('custom_blocked_keywords', []) || [],
        blockedUsers: GM_getValue('custom_blocked_users', []) || [],
        highlighted: GM_getValue('custom_highlight_keywords', []) || [],
        readLinks: GM_getValue('custom_read_links', []) || [],
        autoLoadNextPage: GM_getValue('custom_auto_load', false),
        autoExtractOnLoad: GM_getValue('custom_auto_extract', true),
        imageCount: GM_getValue('custom_image_count', 2),
        imageSize: GM_getValue('custom_image_size', '120px'),
        concurrentEnabled: GM_getValue('custom_concurrent_enabled', false),
        concurrentCount: GM_getValue('custom_concurrent_count', 3),
        concurrentDelay: GM_getValue('custom_concurrent_delay', 600),
        offline115Cid: GM_getValue('offline_115_cid', '0'),
        offline115CidName: GM_getValue('offline_115_cid_name', '根目录'),
        offline115AutoOpen: GM_getValue('offline_115_auto_open', false),
        offline115Favorites: GM_getValue('offline_115_favorites', []),
        offline115FavMax: GM_getValue('offline_115_fav_max', 5),
        lightboxCenterRatio: GM_getValue('custom_lightbox_center', 33),
        offline115NewFolder: GM_getValue('offline_115_new_folder', ''),
        offline115Urls: GM_getValue('offline_115_urls', ''),
        offline115RenameRules: GM_getValue('offline_115_rename_rules', []),
        offline115LogMaxLines: GM_getValue('offline_115_log_max', 100),
        quickReplyText: GM_getValue('custom_quick_reply_text', '谢谢楼主分享'),
        threadCache: {},
        isLoadingNextPage: false,
        nextPageUrl: document.querySelector('a.nxt') ? document.querySelector('a.nxt').href : null
    };

    if (!Array.isArray(STATE.blocked)) STATE.blocked = [];
    if (!Array.isArray(STATE.blockedUsers)) STATE.blockedUsers = [];
    if (!Array.isArray(STATE.highlighted)) STATE.highlighted = [];
    if (!Array.isArray(STATE.readLinks)) STATE.readLinks = [];

    const saveState = (key, value) => { GM_setValue(key, value); };
    const markAsRead = (url) => {
        if (!STATE.readLinks.includes(url)) {
            STATE.readLinks.push(url);
            if (STATE.readLinks.length > 1000) STATE.readLinks.shift();
            saveState('custom_read_links', STATE.readLinks);
        }
    };

    // ================= CSS 样式注入 =================
    GM_addStyle(`
        #custom-hover-tooltip {
            position: fixed; z-index: 100000; background: #fff; border: 1px solid #ccc;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); padding: 10px; border-radius: 5px;
            display: none; max-width: 550px; pointer-events: none;
        }
        .custom-highlight { background-color: #fffacd !important; }
        .custom-hidden { display: none !important; }
        .custom-keyword-tag { background: #e9ecef; color: #495057; padding: 2px 6px; border-radius: 3px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; margin: 2px; }
        .custom-del-btn { color: #dc3545; cursor: pointer; font-weight: bold; }
        .custom-viewed-tag { background: #6c757d; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-left: 8px; font-weight: normal; vertical-align: middle; }
        #custom-img-lightbox {
            position: fixed; z-index: 200000; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
            cursor: zoom-out; transition: opacity 0.2s;
        }
        #custom-img-lightbox img {
            max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 6px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        #custom-img-lightbox .custom-lb-zone {
            position: absolute; top: 0; height: 100%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        #custom-img-lightbox .custom-lb-zone:hover { background: rgba(255,255,255,0.08); }
        #custom-img-lightbox .custom-lb-zone-label {
            font-size: 18px; color: rgba(255,255,255,0.6); font-weight: bold;
            padding: 12px 20px; border-radius: 8px; pointer-events: none;
            background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);
        }
        #custom-img-lightbox .custom-lb-zone:hover .custom-lb-zone-label {
            color: #fff; background: rgba(0,0,0,0.5);
        }
        #custom-img-lightbox .custom-lb-counter {
            position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
            color: #fff; font-size: 14px; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
        }
        #custom-115-folder-picker {
            position: fixed; z-index: 210000; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
        }
        #custom-115-folder-picker .fp-box {
            background: #fff; border-radius: 8px; width: 420px; max-height: 70vh;
            display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        #custom-115-folder-picker .fp-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 14px;
        }
        #custom-115-folder-picker .fp-header .fp-close { cursor: pointer; font-size: 22px; color: #999; }
        #custom-115-folder-picker .fp-header .fp-close:hover { color: #333; }
        #custom-115-folder-picker .fp-breadcrumb {
            padding: 8px 16px; font-size: 12px; color: #007bff; border-bottom: 1px solid #f0f0f0;
            display: flex; gap: 4px; flex-wrap: wrap;
        }
        #custom-115-folder-picker .fp-breadcrumb span { cursor: pointer; }
        #custom-115-folder-picker .fp-breadcrumb span:hover { text-decoration: underline; }
        #custom-115-folder-picker .fp-list {
            flex: 1; overflow-y: auto; padding: 8px 0;
        }
        #custom-115-folder-picker .fp-item {
            padding: 8px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px;
        }
        #custom-115-folder-picker .fp-item:hover { background: #f5f5f5; }
        #custom-115-folder-picker .fp-item.fp-selected { background: #e8f0fe; color: #1a73e8; }
        #custom-115-folder-picker .fp-footer {
            padding: 10px 16px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 8px;
        }
        #custom-115-folder-picker .fp-footer button {
            padding: 6px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px;
        }
    `);

    const tooltip = document.createElement('div');
    tooltip.id = 'custom-hover-tooltip';
    document.body.appendChild(tooltip);

    // ================= Toast 提示 =================
    const showToast = (msg, type = 'success') => {
        const toast = document.createElement('div');
        const bg = type === 'success' ? '#52c41a' : type === 'error' ? '#dc3545' : '#1890ff';
        toast.style.cssText = `position:fixed; bottom:80px; right:60px; z-index:300000; background:${bg}; color:#fff; padding:10px 18px; border-radius:6px; font-size:13px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:opacity 0.5s;`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 2500);
        setTimeout(() => { toast.remove(); }, 3000);
    };

    // ================= 图片灯箱预览 =================
    let lbImages = [];
    let lbIndex = 0;
    let lightbox = null;
    let lbImg = null;
    let lbCounter = null;

    const openLightbox = (srcList, startIndex) => {
        lbImages = srcList;
        lbIndex = startIndex;
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'custom-img-lightbox';
            lightbox.style.display = 'none';
            lightbox.innerHTML = `
                <div class="custom-lb-zone custom-lb-zone-left"><span class="custom-lb-zone-label">◀ 上一张</span></div>
                <div class="custom-lb-zone custom-lb-zone-center"><span class="custom-lb-zone-label">✕ 关闭</span></div>
                <div class="custom-lb-zone custom-lb-zone-right"><span class="custom-lb-zone-label">下一张 ▶</span></div>
                <span class="custom-lb-counter"></span>
                <img>
            `;
            document.body.appendChild(lightbox);
            lbImg = lightbox.querySelector('img');
            lbCounter = lightbox.querySelector('.custom-lb-counter');
            lightbox.querySelector('.custom-lb-zone-left').addEventListener('click', () => navigateLightbox(-1));
            lightbox.querySelector('.custom-lb-zone-center').addEventListener('click', closeLightbox);
            lightbox.querySelector('.custom-lb-zone-right').addEventListener('click', () => navigateLightbox(1));
        }
        updateLightbox();
        lightbox.style.display = 'flex';
    };

    const closeLightbox = () => { if (lightbox) lightbox.style.display = 'none'; };

    const updateLightbox = () => {
        lbImg.src = lbImages[lbIndex];
        lbCounter.innerText = (lbIndex + 1) + ' / ' + lbImages.length;
        // 动态更新区域宽度
        const ratio = STATE.lightboxCenterRatio || 33;
        const side = ((100 - ratio) / 2);
        const leftZone = lightbox.querySelector('.custom-lb-zone-left');
        const centerZone = lightbox.querySelector('.custom-lb-zone-center');
        const rightZone = lightbox.querySelector('.custom-lb-zone-right');
        if (leftZone) { leftZone.style.width = side + '%'; leftZone.style.left = '0'; }
        if (centerZone) { centerZone.style.width = ratio + '%'; centerZone.style.left = side + '%'; }
        if (rightZone) { rightZone.style.width = side + '%'; rightZone.style.left = (side + ratio) + '%'; }
    };

    const navigateLightbox = (dir) => {
        lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
        updateLightbox();
    };

    document.addEventListener('keydown', (e) => {
        if (!lightbox || lightbox.style.display !== 'flex') return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
    });

    // ================= 核心功能函数 =================
    const addViewedTag = (linkNode) => {
        if (linkNode && !linkNode.parentNode.querySelector('.custom-viewed-tag')) {
            const tag = document.createElement('span');
            tag.className = 'custom-viewed-tag';
            tag.innerText = '已浏览';
            linkNode.parentNode.appendChild(tag);
        }
    };

    const fetchThreadData = async (url) => {
        if (STATE.threadCache[url]) return STATE.threadCache[url];
        try {
            const response = await fetch(url);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const firstPost = doc.querySelector('#postlist > div[id^="post_"]');

            let data = { images: [], magnets: [], ed2ks: [], torrents: [], txts: [], archives: [], locked: null };
            if (firstPost) {
                const imgElements = firstPost.querySelectorAll('.t_f img, .pcb img');
                data.images = Array.from(imgElements)
                    .map(img => img.getAttribute('file') || img.getAttribute('zoomfile') || img.src)
                    .filter(src => src && !src.includes('smilie') && !src.includes('avatar') && !src.includes('torrent.gif'))
                    .slice(0, STATE.imageCount);

                const magnetRegex = /magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}/gi;
                data.magnets = [...new Set(firstPost.innerHTML.match(magnetRegex) || [])];

                const ed2kRegex = /ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|/gi;
                data.ed2ks = [...new Set(firstPost.innerHTML.match(ed2kRegex) || [])];

                const seenUrls = new Set();
                const toAbs = (raw) => { try { return new URL(raw, url).href; } catch(e) { return raw; } };

                // 检测直接链接：.txt / .zip / .rar / .7z
                firstPost.querySelectorAll('a[href$=".txt"], a[href$=".TXT"], a[href$=".zip"], a[href$=".ZIP"], a[href$=".rar"], a[href$=".RAR"], a[href$=".7z"], a[href$=".7Z"]').forEach(a => {
                    const href = toAbs(a.getAttribute('href'));
                    if (seenUrls.has(href)) return;
                    const lc = href.toLowerCase();
                    if (lc.endsWith('.txt')) {
                        seenUrls.add(href);
                        data.txts.push({ name: a.innerText.trim() || href.split('/').pop(), href: href });
                    } else if (/\.(zip|rar|7z)$/i.test(href)) {
                        seenUrls.add(href);
                        const ext = href.match(/\.(zip|rar|7z)$/i)[1].toLowerCase();
                        data.archives.push({ name: a.innerText.trim() || href.split('/').pop(), href: href, type: ext });
                    }
                });

                // 检测论坛附件链接
                const attachElements = firstPost.querySelectorAll('a[href*="mod=attachment"]');
                attachElements.forEach(a => {
                    const href = toAbs(a.getAttribute('href'));
                    const linkText = a.innerText.trim();
                    const siblingText = a.nextElementSibling ? a.nextElementSibling.innerText : '';
                    const fullText = linkText + ' ' + siblingText;

                    if (fullText.includes('.torrent')) {
                        data.torrents.push({ name: linkText || '下载种子', href: href });
                    }
                    if (fullText.includes('.txt') && !seenUrls.has(href)) {
                        seenUrls.add(href);
                        data.txts.push({ name: linkText || '文本文件', href: href });
                    }
                    const archiveMatch = fullText.match(/\.(zip|rar|7z)/i);
                    if (archiveMatch && !seenUrls.has(href)) {
                        seenUrls.add(href);
                        data.archives.push({ name: linkText || '压缩包', href: href, type: archiveMatch[1].toLowerCase() });
                    }
                });

                // 检测隐藏内容（需回复可见）
                const lockedDiv = firstPost.querySelector('.locked');
                if (lockedDiv) {
                    const replyLink = lockedDiv.querySelector('a[href*="action=reply"]');
                    data.locked = {
                        message: lockedDiv.innerText.trim(),
                        replyUrl: replyLink ? toAbs(replyLink.getAttribute('href')) : null
                    };
                }
            }
            STATE.threadCache[url] = data;
            return data;
        } catch (error) {
            console.error('抓取失败:', error);
            return null;
        }
    };

    // ================= 文件提取辅助函数 =================
    // 内联 ZIP 读取器 —— 从中央目录读取元数据，使用浏览器 DecompressionStream 解压
    const extractZipInline = async (buffer) => {
        const bytes = new Uint8Array(buffer);
        const td = new TextDecoder();
        const txtFiles = [];

        // 第一步：倒序查找 EOCD (PK\x05\x06)，定位中央目录
        let eocdOff = -1;
        for (let i = bytes.length - 22; i >= 0; i--) {
            if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
                eocdOff = i; break;
            }
        }
        if (eocdOff < 0) return txtFiles;

        const eocd = new DataView(bytes.buffer, bytes.byteOffset + eocdOff, 22);
        const cdOff = eocd.getUint32(16, true);  // 中央目录偏移
        const cdSize = eocd.getUint32(12, true);  // 中央目录大小
        if (cdOff + cdSize > bytes.length) return txtFiles;

        // 第二步：遍历中央目录条目，收集 .txt 文件的准确元数据
        const entries = [];
        let pos = cdOff;
        const cdEnd = cdOff + cdSize;
        while (pos < cdEnd - 46) {
            if (bytes[pos] !== 0x50 || bytes[pos+1] !== 0x4B || bytes[pos+2] !== 0x01 || bytes[pos+3] !== 0x02) break;
            const v = new DataView(bytes.buffer, bytes.byteOffset + pos, 46);
            const method      = v.getUint16(10, true);
            const compSize    = v.getUint32(20, true);   // ← 中央目录的 compSize 永远准确
            const nameLen     = v.getUint16(28, true);
            const extraLen    = v.getUint16(30, true);
            const commentLen  = v.getUint16(32, true);
            const localOff    = v.getUint32(42, true);   // local header 偏移
            const fileName    = td.decode(bytes.slice(pos + 46, pos + 46 + nameLen));

            if (!fileName.endsWith('/') && fileName.toLowerCase().endsWith('.txt')) {
                entries.push({ fileName, method, compSize, localOff });
            }
            pos += 46 + nameLen + extraLen + commentLen;
        }

        // 第三步：根据中央目录的 localOff 定位数据，用准确 compSize 解压
        for (const e of entries) {
            if (e.localOff + 30 > bytes.length) continue;
            const lh = new DataView(bytes.buffer, bytes.byteOffset + e.localOff, 30);
            const lhNameLen  = lh.getUint16(26, true);
            const lhExtraLen = lh.getUint16(28, true);
            const dataStart  = e.localOff + 30 + lhNameLen + lhExtraLen;
            const dataEnd    = dataStart + e.compSize;
            if (dataEnd > bytes.length) continue;

            const rawData = bytes.slice(dataStart, dataEnd);
            let content;

            if (e.compSize === 0) {
                content = '';
            } else if (e.method === 0) {
                content = td.decode(rawData);
            } else if (e.method === 8) {
                try {
                    const ds = new DecompressionStream('deflate-raw');
                    const writer = ds.writable.getWriter();
                    const reader = ds.readable.getReader();
                    writer.write(rawData);
                    writer.close();
                    const chunks = [];
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                    }
                    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
                    const out = new Uint8Array(totalLen);
                    let off = 0;
                    for (const c of chunks) { out.set(c, off); off += c.length; }
                    content = td.decode(out);
                } catch (err) {
                    content = `[解压失败: ${err.message}]`;
                }
            } else {
                content = `[不支持的压缩方法: ${e.method}]`;
            }

            txtFiles.push({ filename: e.fileName, content });
        }

        return txtFiles;
    };

    // JSZip 动态加载（仅作后备，正常情况下内联读取器已足够）
    const loadJSZip = async () => {
        if (window.JSZip) return window.JSZip;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://lib.baomitu.com/jszip/3.10.1/jszip.min.js';
            const t = setTimeout(() => { s.remove(); reject(new Error('CDN 超时')); }, 6000);
            s.onload = () => { clearTimeout(t); window.JSZip ? resolve() : reject(new Error('未挂载')); };
            s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('网络错误')); };
            document.head.appendChild(s);
        });
        return window.JSZip;
    };

    // GM_xmlhttpRequest 封装 —— 绕过 CORS 限制 + 防盗链
    const gmFetch = (url, responseType = 'text') => new Promise((resolve, reject) => {
        console.log('[gmFetch] 尝试请求:', url);
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: responseType,
            timeout: responseType === 'blob' || responseType === 'arraybuffer' ? 60000 : 30000,
            headers: {
                'Referer': location.href,
                'User-Agent': navigator.userAgent
            },
            cookie: document.cookie,
            onload: (resp) => {
                console.log('[gmFetch] 响应状态:', resp.status, 'URL:', url);
                if (resp.status >= 200 && resp.status < 400) {
                    resolve(resp);
                } else {
                    reject(new Error(`HTTP ${resp.status}`));
                }
            },
            onerror: (err) => {
                console.error('[gmFetch] 网络错误:', url, err);
                reject(new Error('网络错误'));
            },
            ontimeout: () => reject(new Error('请求超时'))
        });
    });

    // ================= 115 网盘离线下载 API =================
    const api115 = {
        get: (url) => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01' },
                onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(new Error('解析失败')); } },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('超时'))
            });
        }),
        post: (url, data) => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: new URLSearchParams(data).toString(),
                onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(new Error('解析失败')); } },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('超时'))
            });
        }),
        postForm: (url, data) => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url,
                data: new URLSearchParams(data).toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(new Error('解析失败')); } },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('超时'))
            });
        }),
        // 直接发送已编码的字符串，不做二次编码
        postRaw: (url, bodyString) => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url,
                data: bodyString,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                onload: (r) => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(new Error('解析失败')); } },
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('超时'))
            });
        })
    };

    const offline115GetSign = async () => {
        const resp = await api115.get('https://115.com/?ct=offline&ac=space');
        if (!resp.sign || !resp.time) throw new Error('获取签名失败，请确认已登录 115');
        return { sign: resp.sign, time: resp.time, uid: resp.uid };
    };

    const offline115AddTask = async (url, cid) => {
        const auth = await offline115GetSign();
        // 手动拼接 body，url 只编码一次
        let body = `uid=${encodeURIComponent(auth.uid)}&sign=${encodeURIComponent(auth.sign)}&time=${encodeURIComponent(auth.time)}&url=${encodeURIComponent(url)}`;
        if (cid && cid !== '0') body += `&wp_path_id=${encodeURIComponent(cid)}`;
        return await api115.postRaw('https://115.com/web/lixian/?ct=lixian&ac=add_task_url', body);
    };

    const offline115CreateFolder = async (pid, name) => {
        return await api115.postForm('https://webapi.115.com/files/add', { pid, cname: name });
    };

    const offline115FindFolder = async (pid, name) => {
        const folders = await offline115ListFolders(pid);
        const found = folders.find(f => (f.n || f.name) === name);
        return found ? found.cid : null;
    };

    const offline115ListFolders = async (cid = '0') => {
        const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=1&limit=1150&format=json`);
        if (!resp.state) throw new Error(resp.error || '获取文件夹列表失败');
        return (resp.data || []).filter(item => item.cid && item.n); // 只返回文件夹
    };

    const offline115GetQuota = async () => {
        try {
            const resp = await api115.get('https://115.com/web/lixian/?ct=lixian&ac=get_quota_package_info');
            if (resp && typeof resp.count === 'number' && typeof resp.surplus === 'number') {
                return {
                    total: resp.count,
                    used: resp.count - resp.surplus,
                    remain: resp.surplus,
                    maxSize: resp.max_size || 0
                };
            }
            return null;
        } catch (e) {
            console.warn('[115] 获取配额失败:', e.message);
            return null;
        }
    };

    // ================= 115 在线解压 + 文件管理 API =================
    const isArchiveUrl = (url) => /\.(zip|rar|7z)$/i.test(url.split('?')[0]);

    const offline115GetExtractInfo = async (pickCode) => {
        return await api115.get(`https://webapi.115.com/files/extract_info?pick_code=${pickCode}&file_name=&page_count=999&paths=%E6%96%87%E4%BB%B6`);
    };

    const offline115ExtractFile = async (pickCode, cid, extractFile, extractDir, paths, password) => {
        const data = {
            pick_code: pickCode,
            extract_file: extractFile,
            extract_dir: extractDir,
            to_pid: cid,
            paths: paths
        };
        if (password) data.password = password;
        return await api115.post('https://webapi.115.com/files/add_extract_file', data);
    };

    // 删除文件（fid 格式：{文件ID: 0}）
    const offline115DeleteFiles = async (fidMap) => {
        return await api115.post('https://webapi.115.com/rb/delete', { fid: fidMap });
    };

    // 批量重命名（PHP 数组格式：file_list[0][fid]=...）
    const offline115BatchRename = async (fileList) => {
        const params = new URLSearchParams();
        fileList.forEach((f, i) => {
            params.append(`file_list[${i}][fid]`, f.fid);
            params.append(`file_list[${i}][file_name]`, f.file_name);
        });
        const body = params.toString();
        return await api115.postRaw('https://webapi.115.com/files/batch_rename', body);
    };

    // 自动重命名：扫描目录中文件/文件夹，应用重命名规则
    const offline115AutoRename = async (cid, logFn) => {
        let rules = STATE.offline115RenameRules;
        if (!Array.isArray(rules)) { STATE.offline115RenameRules = []; rules = []; }
        if (rules.length === 0) return;

        logFn(`✏️ 开始自动重命名（${rules.length} 条规则，目标目录 CID=${cid}）...`);
        for (const r of rules) logFn(`  规则: "${r.find}" → "${r.replace}"`);

        let offset = 0;
        const renameList = [];
        let totalScanned = 0;

        try {
            while (true) {
                const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=${offset}&show_dir=1&limit=1150&format=json`);
                if (!resp.state || !resp.data || resp.data.length === 0) break;

                for (const f of resp.data) {
                    const name = f.n || f.name || '';
                    if (!name) continue;
                    totalScanned++;

                    for (const rule of rules) {
                        const findStr = rule.find || '';
                        if (!findStr) continue;
                        const replaceStr = rule.replace || '';

                        const matched = name.includes(findStr);
                        if (!matched) continue;

                        // 转义特殊字符，构造正则
                        const escaped = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(escaped, 'g');
                        const newName = name.replace(regex, replaceStr);

                        logFn(`  🔍 "${name}" 匹配 "${findStr}" → "${newName}"`);

                        if (newName !== name && newName.length > 0 && newName.length <= 255) {
                            renameList.push({ fid: f.fid, file_name: newName });
                            break; // 一个文件只匹配第一个规则
                        } else {
                            logFn(`    ⚠️ 替换后名称为空或超长，跳过`);
                        }
                    }
                }
                offset += resp.data.length;
            }

            if (renameList.length > 0) {
                logFn(`  共 ${renameList.length} 个文件需重命名，开始执行...`);
                for (let i = 0; i < renameList.length; i += 50) {
                    const batch = renameList.slice(i, i + 50);
                    const result = await offline115BatchRename(batch);
                    logFn(`  ${result.state ? '✅' : '❌'} 批次 ${Math.min(i + 50, renameList.length)}/${renameList.length}: ${result.state ? '成功' : (result.error || result.message || '未知错误')}`);
                }
                logFn(`✏️ 重命名完成：${renameList.length} 个文件已更名（共扫描 ${totalScanned} 个）`);
            } else {
                logFn(`✏️ 未找到匹配文件（共扫描 ${totalScanned} 个）`);
            }
        } catch (e) {
            logFn(`✏️ 重命名出错: ${e.message}`);
        }
    };

    // 轮询解压进度
    const offline115GetUnzipProgress = async (extractId) => {
        return await api115.get(`https://webapi.115.com/files/add_extract_file?extract_id=${extractId}`);
    };

    // 从目录中查找指定文件名的 pick_code
    const offline115FindFilePickCode = async (cid, fileName) => {
        try {
            const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=0&limit=100&format=json`);
            if (!resp.state || !resp.data) return null;
            // 查找最近添加的匹配文件
            const target = resp.data.find(f => f.n && f.n === fileName);
            return target ? target.pc : null; // pc = pick_code
        } catch (e) {
            console.warn('[115] 查找文件失败:', e.message);
            return null;
        }
    };

    // 等待离线任务完成并解压（支持密码、自动删除、重命名）
    const offline115WaitAndExtract = async (url, cid, logFn, password) => {
        // 提取文件名
        let fileName = '';
        try {
            const urlPath = new URL(url).pathname;
            fileName = decodeURIComponent(urlPath.split('/').pop());
        } catch(e) {}

        // 轮询任务完成
        logFn(`  ⏳ 等待下载完成...`);
        const maxWait = 180;
        let completed = false;
        for (let i = 0; i < maxWait; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const taskResp = await api115.get('https://115.com/web/lixian/?ct=lixian&ac=task_lists&page=1');
                if (taskResp.state && taskResp.tasks) {
                    const task = taskResp.tasks.find(t => {
                        if (t.url && t.url === url) return true;
                        const hash = url.match(/[a-fA-F0-9]{40}/);
                        if (hash && t.info_hash && t.info_hash.toUpperCase() === hash[0].toUpperCase()) return true;
                        if (t.name && fileName && t.name === fileName) return true;
                        return false;
                    });
                    if (task) {
                        if (task.status === -1) {
                            logFn(`  ❌ 离线下载失败: ${task.err_msg || '未知错误'}`);
                            return;
                        }
                        if (task.percentDone >= 99.9) { completed = true; break; }
                        logFn(`  ⏳ 下载中 ${task.percentDone.toFixed(1)}%...`);
                    }
                }
            } catch (e) { /* 忽略 */ }
        }

        if (!completed) { logFn(`  ⚠️ 等待超时，跳过`); return; }
        logFn(`  ✅ 下载完成，开始解压...`);

        await new Promise(r => setTimeout(r, 3000));

        // 查找文件
        let pickCode = await offline115FindFilePickCode(cid, fileName);
        let fileFid = null;
        let fileN = '';

        if (!pickCode && fileName) {
            try {
                const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=0&limit=20&format=json`);
                if (resp.state && resp.data) {
                    const archive = resp.data.find(f => f.n && /\.(zip|rar|7z)$/i.test(f.n));
                    if (archive) { pickCode = archive.pc; fileFid = archive.fid; fileN = archive.n; }
                }
            } catch(e) {}
        }

        // 获取 fid（用于删除和重命名）
        if (pickCode && !fileFid) {
            try {
                const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=0&limit=100&format=json`);
                if (resp.state && resp.data) {
                    const f = resp.data.find(x => x.pc === pickCode);
                    if (f) { fileFid = f.fid; fileN = f.n; }
                }
            } catch(e) {}
        }

        if (!pickCode) { logFn(`  ⚠️ 未在目录中找到文件`); return; }

        // 获取压缩包信息并解压
        try {
            const info = await offline115GetExtractInfo(pickCode);
            if (!info.state || !info.data || !info.data.list) {
                logFn(`  ⚠️ 获取解压列表失败`);
                return;
            }

            // 检测是否需要密码
            if (info.data.need_password && !password) {
                logFn(`  🔑 此压缩包需要密码，请在面板中输入密码后点击继续`);
                // 在面板中显示密码输入
                showPasswordInput(url, cid, logFn);
                return;
            }

            const extractFiles = [];
            const extractDirs = [];
            let paths = '';
            for (const item of info.data.list) {
                if (item.file_category === 1) extractFiles.push(item.file_name);
                if (item.file_category === 0) extractDirs.push(item.file_name);
            }
            if (info.data.paths) paths = info.data.paths.map(p => p.file_name).join('/');

            const extractResult = await offline115ExtractFile(pickCode, cid, extractFiles, extractDirs, paths, password);

            if (extractResult.state) {
                logFn(`  ✅ 解压成功`);

                // 轮询等待解压完成后删除压缩包
                if (fileFid) {
                    logFn(`  ⏳ 等待解压完成后删除压缩包...`);
                    let deleteReady = false;
                    if (extractResult.data && extractResult.data.extract_id) {
                        for (let i = 0; i < 60; i++) {
                            await new Promise(r => setTimeout(r, 3000));
                            try {
                                const progress = await offline115GetUnzipProgress(extractResult.data.extract_id);
                                if (progress && progress.state && progress.data && progress.data.percent >= 100) {
                                    deleteReady = true; break;
                                }
                                if (progress && progress.state === false) break;
                            } catch(e) { break; }
                        }
                    } else {
                        // 无 extract_id，等固定时间
                        await new Promise(r => setTimeout(r, 10000));
                        deleteReady = true;
                    }

                    if (deleteReady) {
                        try {
                            const delResult = await offline115DeleteFiles({ [fileFid]: 0 });
                            if (delResult.state) {
                                logFn(`  🗑️ 已删除压缩包`);
                            } else if (delResult.error && delResult.error.includes('已删除')) {
                                logFn(`  ℹ️ 压缩包已自动删除`);
                            } else {
                                logFn(`  ⚠️ 删除失败: ${delResult.error || delResult.message || '未知'}`);
                            }
                        } catch(e) {
                            logFn(`  ⚠️ 删除出错: ${e.message}`);
                        }
                    }
                }
            } else {
                const errMsg = extractResult.error || extractResult.message || '未知错误';
                // 密码错误
                if (errMsg.includes('密码') || errMsg.includes('password') || extractResult.errno === 911) {
                    logFn(`  🔑 密码错误或需要密码，请在面板中输入密码后点击继续`);
                    showPasswordInput(url, cid, logFn);
                } else {
                    logFn(`  ❌ 解压失败: ${errMsg}`);
                }
            }
        } catch (e) {
            logFn(`  ⚠️ 解压过程出错: ${e.message}`);
        }
    };

    // 密码输入 UI
    const showPasswordInput = (url, cid, logFn, pickCodeOverride) => {
        const logEl = document.getElementById('offline115-log');
        if (!logEl) return;

        const existingPw = document.getElementById('offline115-pw-wrap');
        if (existingPw) existingPw.remove();

        const pwWrap = document.createElement('div');
        pwWrap.id = 'offline115-pw-wrap';
        pwWrap.style.cssText = 'margin-top:6px; padding:8px; border:1px solid #ffc107; border-radius:4px; background:#fffdf5;';
        pwWrap.innerHTML = `
            <div style="font-size:12px; color:#856404; margin-bottom:4px;">🔑 压缩包需要密码：</div>
            <div style="display:flex; gap:4px;">
                <input type="password" id="offline115-pw-input" style="flex:1; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:3px;" placeholder="输入解压密码">
                <button type="button" id="offline115-pw-submit" style="padding:4px 10px; font-size:12px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:3px; font-weight:bold;">继续解压</button>
            </div>
        `;
        logEl.appendChild(pwWrap);
        logEl.scrollTop = logEl.scrollHeight;

        const pwInput = pwWrap.querySelector('#offline115-pw-input');
        const pwBtn = pwWrap.querySelector('#offline115-pw-submit');

        const submitPw = async () => {
            const password = pwInput.value.trim();
            if (!password) { pwInput.focus(); return; }
            pwBtn.disabled = true;
            pwBtn.innerText = '解压中...';
            logFn(`  🔑 使用密码重新解压...`);
            await offline115WaitAndExtract(url, cid, logFn, password);
            pwWrap.remove();
        };

        pwBtn.onclick = submitPw;
        pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPw(); });
        pwInput.focus();
    };

    // 批量处理压缩包解压（推送完成后调用，扫描目录中所有压缩包）
    const offline115ExtractArchives = async (urls, cid, logFn) => {
        logFn(`\n📦 开始扫描目标目录中的压缩包...`);

        // 方式1：检查推送的 URL 是否直接是压缩包链接
        const archiveUrls = urls.filter(u => isArchiveUrl(u));

        // 方式2：扫描目标目录，查找最近添加的压缩包
        let foundArchives = [];
        try {
            const resp = await api115.get(`https://webapi.115.com/files?aid=1&cid=${cid}&o=user_ptime&asc=0&offset=0&show_dir=0&limit=50&format=json`);
            if (resp.state && resp.data) {
                foundArchives = resp.data.filter(f => f.n && /\.(zip|rar|7z)$/i.test(f.n));
                logFn(`  扫描到 ${foundArchives.length} 个压缩包（共 ${resp.data.length} 个文件）`);
                for (const a of foundArchives) logFn(`    📦 ${a.n} (fid=${a.fid})`);
            }
        } catch(e) { logFn(`  ⚠️ 扫描目录失败: ${e.message}`); }

        if (archiveUrls.length === 0 && foundArchives.length === 0) {
            logFn(`📦 未发现压缩包，跳过解压`);
            return;
        }

        logFn(`📦 共 ${foundArchives.length} 个压缩包，开始逐个解压...`);

        // 逐个解压
        for (const archive of foundArchives) {
            const archiveBaseName = archive.n.replace(/\.(zip|rar|7z)$/i, '');
            logFn(`\n📦 解压: ${archive.n}`);

            try {
                const info = await offline115GetExtractInfo(archive.pc);
                if (!info.state || !info.data || !info.data.list) {
                    logFn(`  ⚠️ 获取解压列表失败`);
                    continue;
                }

                // 检测密码
                if (info.data.need_password) {
                    logFn(`  🔑 此压缩包需要密码，请在面板中输入密码后点击继续`);
                    showPasswordInput(null, cid, logFn, archive.pc);
                    continue;
                }

                const extractFiles = [];
                const extractDirs = [];
                let paths = '';
                for (const item of info.data.list) {
                    if (item.file_category === 1) extractFiles.push(item.file_name);
                    if (item.file_category === 0) extractDirs.push(item.file_name);
                }
                if (info.data.paths) paths = info.data.paths.map(p => p.file_name).join('/');

                // 判断是否需要创建文件夹：文件数 > 1 或压缩包内有路径信息
                let targetCid = cid;
                const needsFolder = extractFiles.length > 1 || (info.data.paths && info.data.paths.length > 0);
                if (needsFolder) {
                    logFn(`  📁 多文件压缩包，创建文件夹「${archiveBaseName}」...`);
                    try {
                        const folderResp = await offline115CreateFolder(cid, archiveBaseName);
                        if (folderResp.state && folderResp.cid) {
                            targetCid = folderResp.cid;
                            logFn(`  ✅ 文件夹创建成功 (CID: ${targetCid})`);
                        } else if (folderResp.errno === 20004 || (folderResp.error && folderResp.error.includes('已存在'))) {
                            const existingCid = await offline115FindFolder(cid, archiveBaseName);
                            if (existingCid) { targetCid = existingCid; logFn(`  ℹ️ 使用已有文件夹`); }
                        }
                    } catch(e) { logFn(`  ⚠️ 创建文件夹失败，解压到当前目录`); }
                }

                const extractResult = await offline115ExtractFile(archive.pc, targetCid, extractFiles, extractDirs, paths);
                if (extractResult.state) {
                    logFn(`  ✅ 解压成功${needsFolder ? '（到文件夹）' : ''}`);

                    // 等待解压完成
                    const extractId = extractResult.data?.extract_id;
                    if (extractId) {
                        logFn(`  ⏳ 等待解压完成...`);
                        for (let i = 0; i < 60; i++) {
                            await new Promise(r => setTimeout(r, 3000));
                            try {
                                const prog = await offline115GetUnzipProgress(extractId);
                                if (prog?.data?.percent >= 100) break;
                                if (prog?.state === false) { logFn(`  ⚠️ 解压状态异常`); break; }
                            } catch(e) { break; }
                        }
                    } else { await new Promise(r => setTimeout(r, 10000)); }

                    // 删除压缩包
                    if (archive.fid) {
                        try {
                            const delResult = await offline115DeleteFiles({ [archive.fid]: 0 });
                            if (delResult.state) {
                                logFn(`  🗑️ 已删除压缩包`);
                            } else if (delResult.error && delResult.error.includes('已删除')) {
                                logFn(`  ℹ️ 压缩包已自动删除`);
                            } else {
                                logFn(`  ⚠️ 删除失败: ${delResult.error || delResult.message || '未知'}`);
                            }
                        } catch(e) { logFn(`  ⚠️ 删除出错: ${e.message}`); }
                    }
                } else {
                    const errMsg = extractResult.error || extractResult.message || '未知';
                    if (errMsg.includes('密码') || errMsg.includes('password')) {
                        logFn(`  🔑 需要密码`);
                        showPasswordInput(null, cid, logFn, archive.pc);
                    } else {
                        logFn(`  ❌ 解压失败: ${errMsg}`);
                    }
                }
            } catch(e) {
                logFn(`  ❌ 解压出错: ${e.message}`);
            }
        }

        logFn(`📦 解压流程结束`);
    };

    // ================= 种子 → 磁力链接转换 =================
    const torrentToMagnet = async (torrentUrl) => {
        // 第一步：下载种子文件
        let buffer;
        try {
            const resp = await fetch(torrentUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            buffer = await resp.arrayBuffer();
        } catch (e) {
            try {
                const gmResp = await gmFetch(torrentUrl, 'arraybuffer');
                buffer = gmResp.response; // GM_xmlhttpRequest 的 arraybuffer 响应直接在 .response
            } catch (gmErr) {
                return { error: '无法下载种子文件' };
            }
        }

        const bytes = new Uint8Array(buffer);
        if (bytes.length < 10 || bytes[0] !== 0x64) {
            return { error: '不是有效的种子文件' };
        }

        // 第二步：bencode 解析，定位 info 字典的原始字节范围
        const td = new TextDecoder();
        let pos = 0;

        const parseString = () => {
            let cp = pos;
            while (bytes[cp] !== 0x3A) cp++;
            const len = parseInt(td.decode(bytes.slice(pos, cp)));
            pos = cp + 1;
            const s = td.decode(bytes.slice(pos, pos + len));
            pos += len;
            return s;
        };

        const skip = () => {
            if (bytes[pos] === 0x69) {        // 'i' integer
                pos++;
                while (bytes[pos] !== 0x65) pos++;
                pos++;
            } else if (bytes[pos] === 0x6C) {  // 'l' list
                pos++;
                while (bytes[pos] !== 0x65) skip();
                pos++;
            } else if (bytes[pos] === 0x64) {  // 'd' dict
                pos++;
                while (bytes[pos] !== 0x65) { parseString(); skip(); }
                pos++;
            } else {
                parseString();
            }
        };

        let infoStart = -1, infoEnd = -1;
        if (bytes[pos] === 0x64) {
            pos++; // skip 'd'
            while (pos < bytes.length && bytes[pos] !== 0x65) {
                const key = parseString();
                if (key === 'info') {
                    infoStart = pos;
                    skip();
                    infoEnd = pos;
                    break;
                } else {
                    skip();
                }
            }
        }

        if (infoStart < 0) return { error: '种子文件中未找到 info 段' };

        // 第三步：SHA-1 哈希 info 原始字节
        const infoBytes = bytes.slice(infoStart, infoEnd);
        const hashBuffer = await crypto.subtle.digest('SHA-1', infoBytes);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();

        return { magnet: `magnet:?xt=urn:btih:${hashHex}` };
    };

    const fetchTxtContent = async (url) => {
        let response;
        try {
            response = await fetch(url);
        } catch (e) {
            // fetch 失败（跨域 CORS 或网络错误），改用 GM_xmlhttpRequest 绕过
            try {
                const gmResp = await gmFetch(url, 'text');
                return gmResp.responseText;
            } catch (gmErr) {
                console.error('[fetchTxtContent] 所有方式均失败:', url, gmErr);
                throw new Error(`无法访问: ${url.substring(0, 80)}... (${gmErr.message})`);
            }
        }
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('text/html')) {
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // 尝试在下载页中找真正的下载链接
            const dlLink = doc.querySelector('a[href*="aid="]') || doc.querySelector('a[download]');
            if (dlLink && dlLink.href !== url) {
                return fetchTxtContent(new URL(dlLink.getAttribute('href'), url).href);
            }
            // 可能页面本身就是文本内容
            const bodyText = doc.body?.innerText?.trim();
            if (bodyText && bodyText.length < 100000) return bodyText;
            return null;
        }
        return await response.text();
    };

    const fetchAndExtractArchive = async (url, type) => {
        if (type !== 'zip') {
            return { error: `${type.toUpperCase()} 格式需在本地解压，浏览器无法直接处理。请下载后自行解压。` };
        }

        // 第一步：下载压缩包
        let buffer;
        try {
            const resp = await fetch(url);
            if (!resp.ok) return { error: `下载失败 (HTTP ${resp.status})` };
            buffer = await resp.arrayBuffer();
        } catch (e) {
            try {
                const gmResp = await gmFetch(url, 'arraybuffer');
                buffer = gmResp.response;
            } catch (gmErr) {
                console.error('[fetchAndExtractArchive] 下载失败:', url, gmErr);
                return { error: `无法下载压缩包 (${gmErr.message})` };
            }
        }

        // 第二步：内联 ZIP 读取器（零外部依赖，优先使用）
        try {
            const txtFiles = await extractZipInline(buffer);
            if (txtFiles.length > 0) return { txtFiles };
        } catch (e) {
            console.warn('[ZIP] 内联解析失败，尝试 JSZip 后备:', e.message);
        }

        // 第三步：JSZip 后备（处理内联读取器不支持的特殊 ZIP 格式）
        try {
            const JSZip = await loadJSZip();
            const blob = new Blob([buffer]);
            const zip = await JSZip.loadAsync(blob);
            const txtFiles = [];
            for (const [filename, file] of Object.entries(zip.files)) {
                if (file.dir) continue;
                if (filename.endsWith('.txt') || filename.endsWith('.TXT')) {
                    try {
                        const content = await file.async('text');
                        txtFiles.push({ filename, content });
                    } catch (e) {
                        txtFiles.push({ filename, content: `[读取失败: ${e.message}]` });
                    }
                }
            }
            return { txtFiles };
        } catch (e) {
            console.error('[ZIP] JSZip 后备也失败:', e.message);
            return { txtFiles: [] };
        }
    };

    let hoverTimeout = null;
    const handleMouseEnter = (e, url) => {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(async () => {
            tooltip.style.left = (e.clientX + 15) + 'px';
            let topPos = e.clientY + 15;
            if (topPos + 220 > window.innerHeight) topPos = window.innerHeight - 220;
            tooltip.style.top = topPos + 'px';
            tooltip.style.display = 'block';
            tooltip.innerHTML = '<span style="color:#666;font-size:12px;">正在加载预览...</span>';

            const data = await fetchThreadData(url);
            if (data && data.images.length > 0) {
                tooltip.innerHTML = data.images.map(src => `<img src="${src}" style="max-width:240px; max-height:200px; object-fit:cover; margin-right:5px; border-radius:3px;">`).join('');
            } else {
                tooltip.innerHTML = '<span style="color:#999;font-size:12px;">无预览图</span>';
            }
        }, 500);
    };

    const handleMouseLeave = () => {
        clearTimeout(hoverTimeout);
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
    };

    const processThreadNode = (tbody) => {
        if (tbody.hasAttribute('data-custom-processed')) return;
        tbody.setAttribute('data-custom-processed', 'true');

        let link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
        if (!link) return;

        const title = link.innerText;
        const url = link.href;

        const authorNode = tbody.querySelector('td.by cite a');
        const authorName = authorNode ? authorNode.innerText.trim() : '';
        let authorUID = '';
        if (authorNode && authorNode.href) {
            try {
                authorUID = new URL(authorNode.href, location.href).searchParams.get('uid');
            } catch(e) {}
        }

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'custom-thread-checkbox';
        cb.value = url;
        cb.style.cssText = 'width: 16px; height: 16px; margin-right: 8px; vertical-align: middle; cursor: pointer;';
        link.parentNode.insertBefore(cb, link);

        const isKeywordBlocked = STATE.blocked.some(kw => title.includes(kw));
        const isUserBlocked = STATE.blockedUsers.includes(authorName) || (authorUID && STATE.blockedUsers.includes(authorUID));

        if (isKeywordBlocked || isUserBlocked) {
            tbody.classList.add('custom-hidden');
            cb.checked = false;
        } else if (STATE.highlighted.some(kw => title.includes(kw))) {
            tbody.classList.add('custom-highlight');
        }

        if (STATE.readLinks.includes(url)) {
            addViewedTag(link);
        }

        link.addEventListener('click', () => {
            markAsRead(url);
            addViewedTag(link);
        });

        link.addEventListener('mouseenter', (e) => handleMouseEnter(e, url));
        link.addEventListener('mouseleave', handleMouseLeave);
        link.addEventListener('mousemove', (e) => {
            if (tooltip.style.display === 'block') {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            }
        });
    };

    const reapplyFilters = () => {
        document.querySelectorAll('tbody[id^="normalthread_"]').forEach(tbody => {
            let link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
            if (!link) return;
            const title = link.innerText;

            const authorNode = tbody.querySelector('td.by cite a');
            const authorName = authorNode ? authorNode.innerText.trim() : '';
            let authorUID = '';
            if (authorNode && authorNode.href) {
                try { authorUID = new URL(authorNode.href, location.href).searchParams.get('uid'); } catch(e) {}
            }

            tbody.classList.remove('custom-hidden', 'custom-highlight');

            const isKeywordBlocked = STATE.blocked.some(kw => title.includes(kw));
            const isUserBlocked = STATE.blockedUsers.includes(authorName) || (authorUID && STATE.blockedUsers.includes(authorUID));

            if (isKeywordBlocked || isUserBlocked) {
                tbody.classList.add('custom-hidden');
                let cb = tbody.querySelector('.custom-thread-checkbox');
                if (cb) cb.checked = false;
            } else if (STATE.highlighted.some(kw => title.includes(kw))) {
                tbody.classList.add('custom-highlight');
            }
        });
    };

    // ================= 页面初始化与 DOM 监听 =================
    document.querySelectorAll('tbody[id^="normalthread_"]').forEach(processThreadNode);

    const observer = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'TBODY' && node.id && node.id.startsWith('normalthread_')) {
                            processThreadNode(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('tbody[id^="normalthread_"]').forEach(processThreadNode);
                        }
                    }
                });
            }
        }
    });

    const threadListContainer = document.querySelector('#threadlisttableid');
    if (threadListContainer) {
        observer.observe(threadListContainer, { childList: true, subtree: true });
    }

    // ================= 无缝翻页逻辑 =================
    const autoLoadNextPage = async () => {
        if (!STATE.autoLoadNextPage || STATE.isLoadingNextPage || !STATE.nextPageUrl || !threadListContainer) return;
        STATE.isLoadingNextPage = true;

        try {
            const res = await fetch(STATE.nextPageUrl);
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            const newThreads = doc.querySelectorAll('tbody[id^="normalthread_"]');
            newThreads.forEach(tbody => {
                threadListContainer.appendChild(tbody);
            });

            const nextBtn = doc.querySelector('a.nxt');
            STATE.nextPageUrl = nextBtn ? nextBtn.href : null;
        } catch (e) {
            console.error('加载下一页失败', e);
        } finally {
            STATE.isLoadingNextPage = false;
        }
    };

    window.addEventListener('scroll', () => {
        if (STATE.autoLoadNextPage && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800) {
            autoLoadNextPage();
        }
    });

    // ================= UI 控制面板 =================
    const panel = document.createElement('div');
    panel.style.cssText = 'position: fixed; bottom: 50px; right: 50px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end;';

    const settingsPanel = document.createElement('div');
    settingsPanel.style.cssText = 'display: none; flex-direction: column; gap: 10px; background: white; padding: 15px; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 280px;';

    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';

    const toggleLabel = document.createElement('span');
    toggleLabel.innerText = '🔄 开启无缝翻页 (自动加载)';
    toggleLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';

    const toggleSwitch = document.createElement('input');
    toggleSwitch.type = 'checkbox';
    toggleSwitch.checked = STATE.autoLoadNextPage;
    toggleSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';

    toggleSwitch.onchange = (e) => {
        STATE.autoLoadNextPage = e.target.checked;
        saveState('custom_auto_load', STATE.autoLoadNextPage);
    };

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleSwitch);
    settingsPanel.appendChild(toggleRow);

    const autoExtractRow = document.createElement('div');
    autoExtractRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';

    const autoExtractLabel = document.createElement('span');
    autoExtractLabel.innerText = '🚀 启动时自动全选并提取';
    autoExtractLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';

    const autoExtractSwitch = document.createElement('input');
    autoExtractSwitch.type = 'checkbox';
    autoExtractSwitch.checked = STATE.autoExtractOnLoad;
    autoExtractSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';

    autoExtractSwitch.onchange = (e) => {
        STATE.autoExtractOnLoad = e.target.checked;
        saveState('custom_auto_extract', STATE.autoExtractOnLoad);
    };

    autoExtractRow.appendChild(autoExtractLabel);
    autoExtractRow.appendChild(autoExtractSwitch);
    settingsPanel.appendChild(autoExtractRow);

    // 图片数量设置
    const imgCountRow = document.createElement('div');
    imgCountRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const imgCountLabel = document.createElement('span');
    imgCountLabel.innerText = '🖼️ 提取图片数量';
    imgCountLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const imgCountSelect = document.createElement('select');
    imgCountSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    for (let i = 1; i <= 10; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.innerText = i + ' 张';
        if (i === STATE.imageCount) opt.selected = true;
        imgCountSelect.appendChild(opt);
    }
    imgCountSelect.onchange = (e) => {
        STATE.imageCount = parseInt(e.target.value);
        saveState('custom_image_count', STATE.imageCount);
    };
    imgCountRow.appendChild(imgCountLabel);
    imgCountRow.appendChild(imgCountSelect);
    settingsPanel.appendChild(imgCountRow);

    // 图片大小设置
    const imgSizeRow = document.createElement('div');
    imgSizeRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const imgSizeLabel = document.createElement('span');
    imgSizeLabel.innerText = '📐 图片显示高度';
    imgSizeLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const imgSizeSelect = document.createElement('select');
    imgSizeSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    const sizeOptions = [
        { val: '80px', label: '小 (80px)' },
        { val: '120px', label: '中 (120px)' },
        { val: '200px', label: '大 (200px)' },
        { val: '300px', label: '超大 (300px)' }
    ];
    sizeOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val; o.innerText = opt.label;
        if (opt.val === STATE.imageSize) o.selected = true;
        imgSizeSelect.appendChild(o);
    });
    imgSizeSelect.onchange = (e) => {
        STATE.imageSize = e.target.value;
        saveState('custom_image_size', STATE.imageSize);
    };
    imgSizeRow.appendChild(imgSizeLabel);
    imgSizeRow.appendChild(imgSizeSelect);
    settingsPanel.appendChild(imgSizeRow);

    // 灯箱关闭按钮比例
    const lbRatioRow = document.createElement('div');
    lbRatioRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const lbRatioLabel = document.createElement('span');
    lbRatioLabel.innerText = '🖼️ 灯箱关闭按钮宽度';
    lbRatioLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const lbRatioSelect = document.createElement('select');
    lbRatioSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    const ratioOptions = [
        { val: 20, label: '20% (关闭窄)' },
        { val: 25, label: '25%' },
        { val: 33, label: '33% (等分)' },
        { val: 40, label: '40%' },
        { val: 50, label: '50% (关闭宽)' }
    ];
    ratioOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val; o.innerText = opt.label;
        if (opt.val === STATE.lightboxCenterRatio) o.selected = true;
        lbRatioSelect.appendChild(o);
    });
    lbRatioSelect.onchange = (e) => {
        STATE.lightboxCenterRatio = parseInt(e.target.value);
        saveState('custom_lightbox_center', STATE.lightboxCenterRatio);
    };
    lbRatioRow.appendChild(lbRatioLabel);
    lbRatioRow.appendChild(lbRatioSelect);
    settingsPanel.appendChild(lbRatioRow);

    // 并发加载开关
    const concurrentRow = document.createElement('div');
    concurrentRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const concurrentLabel = document.createElement('span');
    concurrentLabel.innerText = '🔀 并发加载 (更快)';
    concurrentLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const concurrentSwitch = document.createElement('input');
    concurrentSwitch.type = 'checkbox';
    concurrentSwitch.checked = STATE.concurrentEnabled;
    concurrentSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    concurrentSwitch.onchange = (e) => {
        STATE.concurrentEnabled = e.target.checked;
        saveState('custom_concurrent_enabled', STATE.concurrentEnabled);
        concurrentCountRow.style.display = e.target.checked ? 'flex' : 'none';
        concurrentDelayRow.style.display = e.target.checked ? 'flex' : 'none';
    };
    concurrentRow.appendChild(concurrentLabel);
    concurrentRow.appendChild(concurrentSwitch);
    settingsPanel.appendChild(concurrentRow);

    // 并发数量（仅在启用并发时显示）
    const concurrentCountRow = document.createElement('div');
    concurrentCountRow.style.cssText = `display: ${STATE.concurrentEnabled ? 'flex' : 'none'}; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;`;
    const concurrentCountLabel = document.createElement('span');
    concurrentCountLabel.innerText = '📊 同时处理个数';
    concurrentCountLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const concurrentCountSelect = document.createElement('select');
    concurrentCountSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    for (let i = 1; i <= 10; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.innerText = i + ' 个';
        if (i === STATE.concurrentCount) opt.selected = true;
        concurrentCountSelect.appendChild(opt);
    }
    concurrentCountSelect.onchange = (e) => {
        STATE.concurrentCount = parseInt(e.target.value);
        saveState('custom_concurrent_count', STATE.concurrentCount);
    };
    concurrentCountRow.appendChild(concurrentCountLabel);
    concurrentCountRow.appendChild(concurrentCountSelect);
    settingsPanel.appendChild(concurrentCountRow);

    // 批次间隔（仅在启用并发时显示）
    const concurrentDelayRow = document.createElement('div');
    concurrentDelayRow.style.cssText = `display: ${STATE.concurrentEnabled ? 'flex' : 'none'}; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;`;
    const concurrentDelayLabel = document.createElement('span');
    concurrentDelayLabel.innerText = '⏱️ 批次间隔时间';
    concurrentDelayLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const concurrentDelaySelect = document.createElement('select');
    concurrentDelaySelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    const delayOptions = [100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000];
    delayOptions.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.innerText = d + 'ms';
        if (d === STATE.concurrentDelay) opt.selected = true;
        concurrentDelaySelect.appendChild(opt);
    });
    concurrentDelaySelect.onchange = (e) => {
        STATE.concurrentDelay = parseInt(e.target.value);
        saveState('custom_concurrent_delay', STATE.concurrentDelay);
    };
    concurrentDelayRow.appendChild(concurrentDelayLabel);
    concurrentDelayRow.appendChild(concurrentDelaySelect);
    settingsPanel.appendChild(concurrentDelayRow);

    // 115 离线下载相关设置
    const offline115AutoRow = document.createElement('div');
    offline115AutoRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const offline115AutoLabel = document.createElement('span');
    offline115AutoLabel.innerText = '☁️ 启动时展开115面板';
    offline115AutoLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const offline115AutoSwitch = document.createElement('input');
    offline115AutoSwitch.type = 'checkbox';
    offline115AutoSwitch.checked = STATE.offline115AutoOpen;
    offline115AutoSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    offline115AutoSwitch.onchange = (e) => {
        STATE.offline115AutoOpen = e.target.checked;
        saveState('offline_115_auto_open', e.target.checked);
    };
    offline115AutoRow.appendChild(offline115AutoLabel);
    offline115AutoRow.appendChild(offline115AutoSwitch);
    settingsPanel.appendChild(offline115AutoRow);

    const offline115FavMaxRow = document.createElement('div');
    offline115FavMaxRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const offline115FavMaxLabel = document.createElement('span');
    offline115FavMaxLabel.innerText = '📁 常用目录显示数量';
    offline115FavMaxLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const offline115FavMaxSelect = document.createElement('select');
    offline115FavMaxSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    for (let i = 3; i <= 15; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.innerText = i + ' 个';
        if (i === STATE.offline115FavMax) opt.selected = true;
        offline115FavMaxSelect.appendChild(opt);
    }
    offline115FavMaxSelect.onchange = (e) => {
        STATE.offline115FavMax = parseInt(e.target.value);
        saveState('offline_115_fav_max', STATE.offline115FavMax);
    };
    offline115FavMaxRow.appendChild(offline115FavMaxLabel);
    offline115FavMaxRow.appendChild(offline115FavMaxSelect);
    settingsPanel.appendChild(offline115FavMaxRow);

    // 115 推送后重命名规则
    const renameRulesWrap = document.createElement('div');
    renameRulesWrap.style.cssText = 'padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    renameRulesWrap.innerHTML = `<div style="font-weight:bold; font-size:13px; margin-bottom:5px;">✏️ 推送后自动重命名规则</div>`;
    const renameListDiv = document.createElement('div');
    renameListDiv.style.cssText = 'max-height:120px; overflow-y:auto;';
    renameRulesWrap.appendChild(renameListDiv);

    const renameAddRow = document.createElement('div');
    renameAddRow.style.cssText = 'display: flex; gap: 4px; margin-top: 6px;';
    const renameFindInput = document.createElement('input');
    renameFindInput.type = 'text'; renameFindInput.placeholder = '查找字符';
    renameFindInput.style.cssText = 'flex:1; padding:3px 5px; font-size:11px; border:1px solid #ccc; border-radius:3px;';
    const renameSep = document.createElement('span');
    renameSep.innerText = '→'; renameSep.style.cssText = 'font-size:11px; color:#888; line-height:24px;';
    const renameReplaceInput = document.createElement('input');
    renameReplaceInput.type = 'text'; renameReplaceInput.placeholder = '替换为';
    renameReplaceInput.style.cssText = 'flex:1; padding:3px 5px; font-size:11px; border:1px solid #ccc; border-radius:3px;';
    const renameAddBtn = document.createElement('button');
    renameAddBtn.type = 'button'; renameAddBtn.innerText = '+';
    renameAddBtn.style.cssText = 'padding:3px 8px; font-size:11px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:3px;';
    renameAddRow.appendChild(renameFindInput);
    renameAddRow.appendChild(renameSep);
    renameAddRow.appendChild(renameReplaceInput);
    renameAddRow.appendChild(renameAddBtn);
    renameRulesWrap.appendChild(renameAddRow);

    const renderRenameRules = () => {
        renameListDiv.innerHTML = '';
        const rules = STATE.offline115RenameRules;
        if (!rules || rules.length === 0) {
            renameListDiv.innerHTML = '<div style="font-size:11px; color:#999;">暂无规则</div>';
            return;
        }
        rules.forEach((rule, i) => {
            const tag = document.createElement('div');
            tag.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:11px; padding:2px 0;';
            tag.innerHTML = `<span style="color:#007bff;">${rule.find}</span><span style="color:#888;">→</span><span style="color:#28a745;">${rule.replace}</span>`;
            const delBtn = document.createElement('span');
            delBtn.innerText = '×';
            delBtn.style.cssText = 'color:#dc3545; cursor:pointer; font-weight:bold; margin-left:auto;';
            delBtn.onclick = () => {
                STATE.offline115RenameRules.splice(i, 1);
                saveState('offline_115_rename_rules', STATE.offline115RenameRules);
                renderRenameRules();
            };
            tag.appendChild(delBtn);
            renameListDiv.appendChild(tag);
        });
    };
    renameAddBtn.onclick = () => {
        const find = renameFindInput.value.trim();
        const replace = renameReplaceInput.value.trim();
        if (!find) return;
        STATE.offline115RenameRules.push({ find, replace });
        saveState('offline_115_rename_rules', STATE.offline115RenameRules);
        renameFindInput.value = ''; renameReplaceInput.value = '';
        renderRenameRules();
    };
    renderRenameRules();
    settingsPanel.appendChild(renameRulesWrap);

    // 一键快速回复固定文本
    const quickReplyRow = document.createElement('div');
    quickReplyRow.style.cssText = 'padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    quickReplyRow.innerHTML = `<div style="font-weight:bold; font-size:13px; margin-bottom:5px;">💬 一键回复固定文本</div>`;
    const quickReplyInput = document.createElement('input');
    quickReplyInput.type = 'text';
    quickReplyInput.value = STATE.quickReplyText;
    quickReplyInput.style.cssText = 'width:100%; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:3px; box-sizing:border-box;';
    quickReplyInput.placeholder = '点击按钮后自动发送的回复内容';
    quickReplyInput.addEventListener('input', () => {
        STATE.quickReplyText = quickReplyInput.value;
        saveState('custom_quick_reply_text', quickReplyInput.value);
    });
    quickReplyRow.appendChild(quickReplyInput);
    settingsPanel.appendChild(quickReplyRow);

    // 日志最大显示行数
    const logMaxRow = document.createElement('div');
    logMaxRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const logMaxLabel = document.createElement('span');
    logMaxLabel.innerText = '📋 115面板日志行数';
    logMaxLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const logMaxSelect = document.createElement('select');
    logMaxSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [50, 100, 150, 200, 300, 500].forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.innerText = n + ' 行';
        if (n === STATE.offline115LogMaxLines) opt.selected = true;
        logMaxSelect.appendChild(opt);
    });
    logMaxSelect.onchange = (e) => {
        STATE.offline115LogMaxLines = parseInt(e.target.value);
        saveState('offline_115_log_max', STATE.offline115LogMaxLines);
    };
    logMaxRow.appendChild(logMaxLabel);
    logMaxRow.appendChild(logMaxSelect);
    settingsPanel.appendChild(logMaxRow);

    const createKeywordManager = (titleText, stateArray, stateKey, placeholderText = '输入关键词') => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div style="font-weight:bold; font-size:13px; margin-bottom:5px;">${titleText}</div>`;
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display: flex; gap: 5px;';
        const input = document.createElement('input');
        input.type = 'text'; input.placeholder = placeholderText; input.style.cssText = 'flex:1; padding:2px 5px; font-size:12px;';
        const btn = document.createElement('button');
        btn.innerText = '添加'; btn.style.cssText = 'padding: 2px 8px; font-size:12px; cursor:pointer;';
        inputRow.appendChild(input); inputRow.appendChild(btn);

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'display: flex; flex-wrap: wrap; margin-top: 5px; max-height: 80px; overflow-y: auto;';

        const render = () => {
            listDiv.innerHTML = '';
            stateArray.forEach(kw => {
                const tag = document.createElement('span');
                tag.className = 'custom-keyword-tag';
                tag.innerHTML = `${kw} <span class="custom-del-btn">×</span>`;
                tag.querySelector('.custom-del-btn').onclick = () => {
                    stateArray.splice(stateArray.indexOf(kw), 1);
                    saveState(stateKey, stateArray);
                    render(); reapplyFilters();
                };
                listDiv.appendChild(tag);
            });
        };
        render();

        btn.onclick = () => {
            const val = input.value.trim();
            if (val && !stateArray.includes(val)) {
                stateArray.push(val); saveState(stateKey, stateArray);
                input.value = ''; render(); reapplyFilters();
            }
        };
        wrap.appendChild(inputRow); wrap.appendChild(listDiv);
        return wrap;
    };

    settingsPanel.appendChild(createKeywordManager('🚫 屏蔽标题关键词', STATE.blocked, 'custom_blocked_keywords', '输入标题关键词'));
    settingsPanel.appendChild(createKeywordManager('👤 屏蔽指定用户', STATE.blockedUsers, 'custom_blocked_users', '输入完整账号或UID数字'));
    settingsPanel.appendChild(createKeywordManager('⭐ 高亮标题关键词', STATE.highlighted, 'custom_highlight_keywords', '输入标题关键词'));

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 100%;';

    const createBtn = (text, bgColor) => {
        const b = document.createElement('button');
        b.innerText = text;
        b.style.cssText = `padding: 8px 15px; background-color: ${bgColor}; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 13px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; font-weight: bold;`;
        b.onmouseover = () => b.style.opacity = '0.8';
        b.onmouseout = () => b.style.opacity = '1';
        return b;
    };

    const btnToggleSet = createBtn('⚙️ 脚本设置', '#6c757d');
    btnToggleSet.onclick = () => settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'flex' : 'none';

    const btnSelectAll = createBtn('全选 / 取消全选', '#28a745');
    let isAllSelected = false;
    btnSelectAll.onclick = () => {
        isAllSelected = !isAllSelected;
        document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden) .custom-thread-checkbox').forEach(cb => {
            cb.checked = isAllSelected;
        });
    };

    // ================= 单帖内容提取与渲染 =================
    const extractSingleThread = async (cb) => {
        const tbody = cb.closest('tbody');
        if (!tbody) return;
        const existingBox = tbody.querySelector('.custom-extracted');
        if (existingBox && !existingBox.dataset.refreshing) return;
        // 如果是刷新模式，移除旧内容
        if (existingBox) existingBox.remove();

        const threadUrl = cb.value;
        markAsRead(threadUrl);
        addViewedTag(tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]'));

        const data = await fetchThreadData(threadUrl);
        if (!data) return;

        const box = document.createElement('div');
        box.className = 'custom-extracted';
        box.style.cssText = 'margin-top:10px; padding-left:25px; display:flex; flex-direction:column; gap:8px;';

        // ---- 图片 ----
        if (data.images.length > 0) {
            const imgWrap = document.createElement('div');
            imgWrap.innerHTML = data.images.map((src, i) => `<img src="${src}" data-idx="${i}" style="max-height:${STATE.imageSize}; object-fit:cover; border-radius:4px; margin-right:5px; cursor:pointer;">`).join('');
            imgWrap.addEventListener('click', (e) => {
                if (e.target.tagName === 'IMG') {
                    e.preventDefault(); e.stopPropagation();
                    openLightbox(data.images, parseInt(e.target.dataset.idx));
                }
            });
            box.appendChild(imgWrap);
        }

        // ---- 隐藏内容（需回复可见） ----
        if (data.locked) {
            const lockedWrap = document.createElement('div');
            lockedWrap.style.cssText = 'margin-top:6px; border:1px solid #ffc107; border-radius:4px; padding:10px; background:#fffdf5;';

            const lockedMsg = document.createElement('div');
            lockedMsg.style.cssText = 'font-size:12px; color:#856404; margin-bottom:8px;';
            lockedMsg.innerText = '🔒 ' + data.locked.message;
            lockedWrap.appendChild(lockedMsg);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:8px;';

            if (data.locked.replyUrl) {
                const btnReply = document.createElement('button');
                btnReply.type = 'button';
                btnReply.innerText = '💬 新窗口回复';
                btnReply.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#28a745; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                btnReply.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    GM_openInTab(data.locked.replyUrl, { active: true, insert: true });
                };
                btnRow.appendChild(btnReply);

                // 快速回复（论坛内置弹窗）
                const btnQuickReply = document.createElement('button');
                btnQuickReply.type = 'button';
                btnQuickReply.innerText = '⚡ 快速回复';
                btnQuickReply.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#17a2b8; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                btnQuickReply.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (typeof showWindow === 'function') {
                        showWindow('reply', data.locked.replyUrl);

                        // 等弹窗加载完，拦截表单提交
                        const interceptReply = () => {
                            const form = document.getElementById('postform');
                            if (!form) { setTimeout(interceptReply, 200); return; }

                            // 移除 onsubmit 属性（防止 ajaxpost 执行）
                            form.removeAttribute('onsubmit');
                            form.setAttribute('onsubmit', 'return false;');

                            // 覆盖成功回调（兜底）
                            window.succeedhandle_reply = (locationhref, message) => {
                                try { hideWindow('reply'); } catch(err) {}
                                showToast('✅ 回复成功', 'success');
                                btnRefresh.click();
                            };

                            // 用 capture 阶段拦截 submit 事件（在论坛绑定的 listener 之前）
                            form.addEventListener('submit', async (ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                ev.stopImmediatePropagation();

                                const submitBtn = form.querySelector('#postsubmit');
                                if (submitBtn) { submitBtn.disabled = true; submitBtn.querySelector('span').innerText = '回复中...'; }

                                try {
                                    // 用 URLSearchParams 编码（与论坛原生一致）
                                    const params = new URLSearchParams(new FormData(form));
                                    const actionUrl = form.getAttribute('action');
                                    // 确保 URL 有 inajax=1
                                    const url = actionUrl.includes('inajax=') ? actionUrl : actionUrl + '&inajax=1';

                                    const resp = await fetch(url, {
                                        method: 'POST',
                                        body: params.toString(),
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
                                    });
                                    const text = await resp.text();

                                    try { hideWindow('reply'); } catch(err) {}
                                    showToast('✅ 回复成功', 'success');
                                    btnRefresh.click();
                                } catch (err) {
                                    try { hideWindow('reply'); } catch(e2) {}
                                    showToast('❌ 回复失败: ' + err.message, 'error');
                                }

                                if (submitBtn) { submitBtn.disabled = false; submitBtn.querySelector('span').innerText = '参与/回复主题'; }
                                return false;
                            }, true); // capture: true
                        };

                        // 延迟等待弹窗 inline script 执行完毕
                        setTimeout(interceptReply, 600);
                    } else {
                        GM_openInTab(data.locked.replyUrl, { active: true, insert: true });
                    }
                };
                btnRow.appendChild(btnQuickReply);

                // 一键快速回复（固定文本自动发送）
                const btnAutoReply = document.createElement('button');
                btnAutoReply.type = 'button';
                btnAutoReply.innerText = '🚀 一键回复';
                btnAutoReply.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#e67e22; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                btnAutoReply.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const replyText = STATE.quickReplyText || '谢谢楼主分享';
                    btnAutoReply.innerText = '发送中...';
                    btnAutoReply.disabled = true;

                    if (typeof showWindow === 'function') {
                        showWindow('reply', data.locked.replyUrl);

                        // 等弹窗加载完，填入文字并自动提交
                        const interceptAutoReply = () => {
                            const form = document.getElementById('postform');
                            if (!form) { setTimeout(interceptAutoReply, 200); return; }

                            // 填入回复内容
                            const msgBox = form.querySelector('#postmessage');
                            if (msgBox) { msgBox.value = replyText; msgBox.focus(); }

                            // 移除 onsubmit，手动提交
                            form.removeAttribute('onsubmit');
                            form.setAttribute('onsubmit', 'return false;');

                            // 覆盖回调防跳转
                            window.succeedhandle_reply = (locationhref, message) => {
                                try { hideWindow('reply'); } catch(err) {}
                                showToast('✅ 一键回复成功', 'success');
                                btnRefresh.click();
                                btnAutoReply.innerText = '🚀 一键回复';
                                btnAutoReply.disabled = false;
                            };

                            // 拦截提交
                            form.addEventListener('submit', async (ev) => {
                                ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
                                try {
                                    const params = new URLSearchParams(new FormData(form));
                                    const actionUrl = form.getAttribute('action');
                                    const url = actionUrl.includes('inajax=') ? actionUrl : actionUrl + '&inajax=1';
                                    await fetch(url, {
                                        method: 'POST', body: params.toString(), credentials: 'include',
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
                                    });
                                    try { hideWindow('reply'); } catch(err) {}
                                    showToast('✅ 一键回复成功', 'success');
                                    btnRefresh.click();
                                } catch (err) {
                                    showToast('❌ 回复失败: ' + err.message, 'error');
                                }
                                btnAutoReply.innerText = '🚀 一键回复';
                                btnAutoReply.disabled = false;
                                return false;
                            }, true);

                            // 自动提交
                            setTimeout(() => {
                                const submitBtn = form.querySelector('#postsubmit');
                                if (submitBtn) submitBtn.click();
                            }, 500);
                        };

                        setTimeout(interceptAutoReply, 600);
                    } else {
                        GM_openInTab(data.locked.replyUrl, { active: true, insert: true });
                        btnAutoReply.innerText = '🚀 一键回复';
                        btnAutoReply.disabled = false;
                    }
                };
                btnRow.appendChild(btnAutoReply);
            }

            const btnRefresh = document.createElement('button');
            btnRefresh.type = 'button';
            btnRefresh.innerText = '🔄 已回复，刷新查看';
            btnRefresh.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#007bff; color:#fff; border:none; border-radius:3px; font-weight:bold;';
            btnRefresh.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                btnRefresh.innerText = '正在刷新...';
                btnRefresh.disabled = true;
                // 记录当前滚动位置
                const scrollY = window.scrollY;
                const boxRect = box.getBoundingClientRect();
                const boxOffsetTop = boxRect.top + window.scrollY;
                // 清除缓存
                delete STATE.threadCache[threadUrl];
                // 标记为刷新模式，让 extractSingleThread 允许替换
                box.dataset.refreshing = '1';
                // 重新提取
                await extractSingleThread(cb);
                // 恢复滚动位置
                requestAnimationFrame(() => {
                    const newBox = tbody.querySelector('.custom-extracted');
                    if (newBox) {
                        const newBoxRect = newBox.getBoundingClientRect();
                        const newBoxOffsetTop = newBoxRect.top + window.scrollY;
                        window.scrollTo(0, scrollY + (newBoxOffsetTop - boxOffsetTop));
                    }
                });
            };
            btnRow.appendChild(btnRefresh);
            lockedWrap.appendChild(btnRow);
            box.appendChild(lockedWrap);
        }

        // ---- 资源链接：磁力/ed2k/种子合并为一个文本框 ----
        const allLinks = [];

        data.magnets.forEach(m => allLinks.push(m));
        data.ed2ks.forEach(link => allLinks.push(link));

        // 种子 → 磁力链接转换
        for (const t of data.torrents) {
            const result = await torrentToMagnet(t.href);
            if (result.magnet) allLinks.push(result.magnet);
        }

        // 收集 TXT 内容（独立 + 压缩包）
        const allTexts = [];
        for (const txt of data.txts) {
            try {
                const content = await fetchTxtContent(txt.href);
                if (content) allTexts.push({ name: txt.name, content });
            } catch (err) {
                allTexts.push({ name: txt.name, content: `[读取失败: ${err.message}]` });
            }
        }
        for (const archive of data.archives) {
            try {
                const result = await fetchAndExtractArchive(archive.href, archive.type);
                if (result.error) {
                    allTexts.push({ name: `${archive.name} (${archive.type})`, content: `[${result.error}]` });
                } else if (result.txtFiles) {
                    result.txtFiles.forEach(tf => allTexts.push({ name: `${archive.name} / ${tf.filename}`, content: tf.content }));
                }
            } catch (err) {
                allTexts.push({ name: `${archive.name}`, content: `[解压失败: ${err.message}]` });
            }
        }

        const hasResources = allLinks.length > 0 || allTexts.length > 0;
        if (hasResources) {
            const resWrap = document.createElement('div');
            resWrap.style.cssText = 'display:flex; flex-direction:column; gap:4px;';

            // 从 TXT 内容中提取离线链接
            const txtLinks = [];
            allTexts.forEach(t => {
                const magnetMatches = t.content.match(/magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}/gi) || [];
                const ed2kMatches = t.content.match(/ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|/gi) || [];
                [...magnetMatches, ...ed2kMatches].forEach(link => {
                    if (!allLinks.includes(link) && !txtLinks.includes(link)) txtLinks.push(link);
                });
            });
            const everyLink = [...allLinks, ...txtLinks];

            // 一键推送函数（日志同步到115面板）
            const pushLinksTo115 = async (links, btn) => {
                const cid = document.getElementById('offline115-cid').value.trim() || '0';
                const newFolder = document.getElementById('offline115-newfolder').value.trim();
                const logEl = document.getElementById('offline115-log');
                btn.disabled = true;
                const origText = btn.innerText;
                btn.innerText = '推送中...';

                const log = (msg) => {
                    if (logEl) { logEl.innerText += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; }
                };

                log(`\n--- 从帖子提取推送 (${links.length} 条) ---`);

                let targetCid = cid;
                if (newFolder) {
                    log(`📁 创建文件夹「${newFolder}」...`);
                    try {
                        const createResp = await offline115CreateFolder(targetCid, newFolder);
                        if (createResp.state && createResp.cid) {
                            targetCid = createResp.cid;
                            log(`✅ 文件夹创建成功 (CID: ${targetCid})`);
                        } else if (createResp.errno === 20004 || (createResp.error && createResp.error.includes('已存在'))) {
                            log(`ℹ️ 文件夹已存在，查找中...`);
                            const existingCid = await offline115FindFolder(targetCid, newFolder);
                            if (existingCid) { targetCid = existingCid; log(`✅ 找到已有文件夹 (CID: ${targetCid})`); }
                        }
                    } catch (e) { log(`⚠️ 文件夹处理失败: ${e.message}`); }
                }

                let ok = 0, fail = 0;
                for (let i = 0; i < links.length; i++) {
                    const link = links[i];
                    const short = link.length > 60 ? link.substring(0, 60) + '...' : link;
                    try {
                        const resp = await offline115AddTask(link, targetCid);
                        if (resp.state === true || resp.state === 'true' || resp.error_code === 10008) {
                            ok++; log(`  [${i+1}/${links.length}] ✅ ${short}`);
                        } else {
                            fail++; log(`  [${i+1}/${links.length}] ❌ ${resp.error_msg || '失败'}`);
                        }
                    } catch (e) { fail++; log(`  [${i+1}/${links.length}] ❌ ${e.message}`); }
                }
                log(`🎉 推送完成：${ok} 成功，${fail} 失败`);
                btn.innerText = `✅ ${ok}/${links.length}`;
                setTimeout(() => { btn.innerText = origText; btn.disabled = false; }, 3000);
                // 刷新配额
                const quotaEl = document.getElementById('offline115-quota');
                if (quotaEl) {
                    const quota = await offline115GetQuota();
                    if (quota) {
                        quotaEl.innerText = `📊 配额：剩 ${quota.remain} / 总 ${quota.total} 个${quota.maxSize ? ' (容量 ' + quota.maxSize + 'GB)' : ''}`;
                        quotaEl.style.color = quota.remain < 100 ? '#dc3545' : quota.remain < 500 ? '#ffc107' : '#888';
                    }
                }
                // 压缩包自动解压
                // TODO: 解压和重命名待修复后启用
                // await offline115ExtractArchives(links, targetCid, log);
                // await offline115AutoRename(targetCid, log);
            };

            // 链接合并文本框
            if (everyLink.length > 0) {
                const linkContent = everyLink.join('\n');
                const linkWrap = document.createElement('div');
                linkWrap.style.cssText = 'border:1px solid #dee2e6; border-radius:4px; padding:8px; background:#fdfdfd;';
                const linkHeader = document.createElement('div');
                linkHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:4px;';
                const linkInfo = document.createElement('span');
                linkInfo.style.cssText = 'font-size:12px; font-weight:bold; color:#495057;';
                linkInfo.innerText = `🔗 链接 (${everyLink.length} 条：${data.magnets.length} 磁力 / ${data.ed2ks.length} ed2k / ${data.torrents.length} 种子${txtLinks.length > 0 ? ' / ' + txtLinks.length + ' TXT中' : ''})`;
                linkHeader.appendChild(linkInfo);

                const linkBtnRow = document.createElement('div');
                linkBtnRow.style.cssText = 'display:flex; gap:4px;';

                const linkCopyBtn = document.createElement('button');
                linkCopyBtn.type = 'button'; linkCopyBtn.innerText = '复制全部';
                linkCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px;';
                linkCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(linkContent).then(() => { linkCopyBtn.innerText = '已复制'; setTimeout(() => linkCopyBtn.innerText = '复制全部', 2000); }); };
                linkBtnRow.appendChild(linkCopyBtn);

                const pushAllBtn = document.createElement('button');
                pushAllBtn.type = 'button'; pushAllBtn.innerText = '☁️ 一键推送全部';
                pushAllBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                pushAllBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); pushLinksTo115(everyLink, pushAllBtn); };
                linkBtnRow.appendChild(pushAllBtn);

                linkHeader.appendChild(linkBtnRow);
                linkWrap.appendChild(linkHeader);

                // 逐行链接 + 每行推送按钮
                const linkListDiv = document.createElement('div');
                linkListDiv.style.cssText = 'max-height:200px; overflow-y:auto; background:#f8f9fa; padding:8px; border-radius:3px;';
                everyLink.forEach(link => {
                    const lineDiv = document.createElement('div');
                    lineDiv.style.cssText = 'display:flex; align-items:center; gap:4px; padding:2px 0; border-bottom:1px solid #eee;';
                    const linkText = document.createElement('span');
                    linkText.style.cssText = 'flex:1; font-size:11px; word-break:break-all; font-family:monospace;';
                    linkText.innerText = link;
                    lineDiv.appendChild(linkText);

                    const lineCopyBtn = document.createElement('button');
                    lineCopyBtn.type = 'button'; lineCopyBtn.innerText = '复制';
                    lineCopyBtn.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#6c757d; color:#fff; border:none; border-radius:2px; flex-shrink:0;';
                    lineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(link).then(() => { lineCopyBtn.innerText = '已复制'; setTimeout(() => lineCopyBtn.innerText = '复制', 1500); }); };
                    lineDiv.appendChild(lineCopyBtn);

                    const linePushBtn = document.createElement('button');
                    linePushBtn.type = 'button'; linePushBtn.innerText = '☁️';
                    linePushBtn.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#fd7e14; color:#fff; border:none; border-radius:2px; flex-shrink:0;';
                    linePushBtn.title = '推送到115';
                    linePushBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); pushLinksTo115([link], linePushBtn); };
                    lineDiv.appendChild(linePushBtn);

                    linkListDiv.appendChild(lineDiv);
                });
                linkWrap.appendChild(linkListDiv);

                if (everyLink.length > 10) {
                    const linkToggle = document.createElement('button');
                    linkToggle.type = 'button'; linkToggle.innerText = '展开全文';
                    linkToggle.style.cssText = 'font-size:11px; margin-top:4px; cursor:pointer; padding:2px 8px; background:#e9ecef; border:1px solid #ccc; border-radius:3px;';
                    linkToggle.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (linkListDiv.style.maxHeight === '200px') { linkListDiv.style.maxHeight = 'none'; linkToggle.innerText = '收起'; } else { linkListDiv.style.maxHeight = '200px'; linkToggle.innerText = '展开全文'; } };
                    linkWrap.appendChild(linkToggle);
                }
                resWrap.appendChild(linkWrap);
            }

            // TXT 内容合并文本框
            if (allTexts.length > 0) {
                const mergedContent = allTexts.map(t =>
                    `━━━━ ${t.name} ━━━━\n${t.content}`
                ).join('\n\n');

                const txtWrap = document.createElement('div');
                txtWrap.style.cssText = 'margin-top:6px; border:1px solid #dee2e6; border-radius:4px; padding:8px; background:#fdfdfd;';

                const txtHeader = document.createElement('div');
                txtHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;';
                txtHeader.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#495057;">📄 TXT 内容 (${allTexts.length} 个文件)</span>`;

                const copyBtn = document.createElement('button');
                copyBtn.type = 'button'; copyBtn.innerText = '复制全文';
                copyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px;';
                copyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(mergedContent).then(() => { copyBtn.innerText = '已复制'; setTimeout(() => copyBtn.innerText = '复制全文', 2000); }); };
                txtHeader.appendChild(copyBtn);
                txtWrap.appendChild(txtHeader);

                const pre = document.createElement('pre');
                pre.textContent = mergedContent;
                pre.style.cssText = 'max-height:200px; overflow-y:auto; background:#f8f9fa; padding:8px; border-radius:3px; font-size:11px; white-space:pre-wrap; word-break:break-all; margin:0;';
                txtWrap.appendChild(pre);

                if (mergedContent.length > 500) {
                    const toggleBtn = document.createElement('button');
                    toggleBtn.type = 'button'; toggleBtn.innerText = '展开全文';
                    toggleBtn.style.cssText = 'font-size:11px; margin-top:4px; cursor:pointer; padding:2px 8px; background:#e9ecef; border:1px solid #ccc; border-radius:3px;';
                    toggleBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (pre.style.maxHeight === '200px') { pre.style.maxHeight = 'none'; toggleBtn.innerText = '收起'; } else { pre.style.maxHeight = '200px'; toggleBtn.innerText = '展开全文'; } };
                    txtWrap.appendChild(toggleBtn);
                }
                resWrap.appendChild(txtWrap);
            }
            box.appendChild(resWrap);
        }

        // 用 rAF 批量插入 DOM，减少画面抖动
        if (box.innerHTML) {
            requestAnimationFrame(() => {
                tbody.querySelector('th').appendChild(box);
            });
        }
    };

    const btnExtract = createBtn('提取内容 (图/磁力/种子/txt/压缩包)', '#ffc107');
    btnExtract.style.color = '#333';
    btnExtract.onclick = async () => {
        const cbs = [...document.querySelectorAll('.custom-thread-checkbox:checked')];
        if (cbs.length === 0) return alert('请先勾选帖子。');

        btnExtract.innerText = '正在提取...';
        btnExtract.disabled = true;

        if (STATE.concurrentEnabled) {
            // 并发模式：分批并行处理
            const CONCURRENCY = STATE.concurrentCount;
            const DELAY = STATE.concurrentDelay;
            for (let i = 0; i < cbs.length; i += CONCURRENCY) {
                const batch = cbs.slice(i, i + CONCURRENCY);
                btnExtract.innerText = `提取中... (${i + 1}-${Math.min(i + CONCURRENCY, cbs.length)}/${cbs.length})`;
                await Promise.all(batch.map(cb => extractSingleThread(cb)));
                if (i + CONCURRENCY < cbs.length) {
                    await new Promise(r => setTimeout(r, DELAY));
                }
            }
        } else {
            // 顺序模式：逐条处理
            for (let i = 0; i < cbs.length; i++) {
                btnExtract.innerText = `提取中... (${i + 1}/${cbs.length})`;
                await extractSingleThread(cbs[i]);
            }
        }
        btnExtract.innerText = '提取内容 (图/磁力/种子/txt/压缩包)';
        btnExtract.disabled = false;
    };

    const btnOpen = createBtn('打开选中帖子', '#007bff');
    btnOpen.onclick = () => {
        const cbs = document.querySelectorAll('.custom-thread-checkbox:checked');
        if (cbs.length === 0) return alert('请勾选帖子。');

        if (confirm(`确认打开 ${cbs.length} 个帖子？`)) {
            cbs.forEach(cb => {
                markAsRead(cb.value);
                const tbody = cb.closest('tbody');
                addViewedTag(tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]'));

                GM_openInTab(cb.value, { active: false, insert: true });
            });
        }
    };

    // ================= 115 离线下载面板 =================
    const offline115Panel = document.createElement('div');
    offline115Panel.style.cssText = 'display:none; flex-direction:column; gap:8px; background:white; padding:15px; border:1px solid #ccc; border-radius:5px; box-shadow:0 4px 6px rgba(0,0,0,0.1); width:280px;';

    offline115Panel.innerHTML = `
        <div style="font-weight:bold; font-size:13px; color:#333; border-bottom:1px dashed #ccc; padding-bottom:8px;">☁️ 115 离线下载</div>
        <div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">离线保存目录</div>
            <div style="display:flex; gap:4px;">
                <div id="offline115-cid-display" style="flex:1; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:3px; background:#f8f9fa; min-height:18px; display:flex; align-items:center; cursor:pointer;" title="点击选择目录">${STATE.offline115CidName}</div>
                <input type="hidden" id="offline115-cid" value="${STATE.offline115Cid}">
                <button type="button" id="offline115-pick-folder" style="padding:4px 8px; font-size:12px; cursor:pointer; background:#17a2b8; color:#fff; border:none; border-radius:3px;">📁</button>
            </div>
        </div>
        <div id="offline115-favorites" style="display:none; margin-top:2px;"></div>
        <div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">新建文件夹（可选）</div>
            <div style="display:flex; gap:4px;">
                <input type="text" id="offline115-newfolder" value="${STATE.offline115NewFolder.replace(/"/g, '&quot;')}" style="flex:1; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:3px;" placeholder="留空则直接推送到上方目录">
                <button type="button" id="offline115-clear-folder" style="padding:4px 8px; font-size:12px; cursor:pointer; background:#dc3545; color:#fff; border:none; border-radius:3px;">✕</button>
            </div>
        </div>
        <div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">离线链接（多条换行）</div>
            <div style="display:flex; gap:4px;">
                <textarea id="offline115-urls" rows="4" style="flex:1; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:3px; resize:vertical;" placeholder="magnet:?xt=urn:btih:...&#10;ed2k://|file|...">${STATE.offline115Urls.replace(/</g, '&lt;')}</textarea>
                <button type="button" id="offline115-clear-urls" style="padding:4px 8px; font-size:12px; cursor:pointer; background:#dc3545; color:#fff; border:none; border-radius:3px; align-self:flex-start;">✕</button>
            </div>
        </div>
        <button type="button" id="offline115-push" style="padding:8px 15px; background:#fd7e14; color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:13px; font-weight:bold;">☁️ 推送到115</button>
        <div id="offline115-log" style="font-size:11px; color:#666; max-height:120px; overflow-y:auto; white-space:pre-wrap;"></div>
        <div id="offline115-quota" style="font-size:11px; color:#888; text-align:center; padding-top:4px; border-top:1px dashed #eee;">配额加载中...</div>
    `;

    // 目录选择器模态框
    // 常用目录管理
    const renderFavorites = () => {
        const container = offline115Panel.querySelector('#offline115-favorites');
        const favs = STATE.offline115Favorites;
        if (!favs || favs.length === 0) {
            container.style.display = 'none';
            return;
        }
        const maxVisible = STATE.offline115FavMax || 5;
        const needScroll = favs.length > maxVisible;
        container.style.display = 'block';
        container.style.marginTop = '2px';
        container.style.border = '1px solid #e0e0e0';
        container.style.borderRadius = '3px';
        container.style.padding = '4px';
        container.style.background = '#fafafa';
        container.style.maxHeight = needScroll ? `${maxVisible * 28}px` : 'none';
        container.style.overflowY = needScroll ? 'auto' : 'visible';
        container.innerHTML = favs.map((f, i) => `
            <div style="display:flex; align-items:center; gap:4px; padding:2px 0; font-size:11px;">
                <input type="radio" name="offline115-fav" value="${f.cid}" ${f.cid === STATE.offline115Cid ? 'checked' : ''} style="cursor:pointer; margin:0;">
                <span style="flex:1; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="CID: ${f.cid}">${f.name}</span>
                <button type="button" data-fav-up="${i}" style="font-size:10px; cursor:pointer; padding:0 4px; background:none; border:1px solid #ccc; border-radius:2px;" ${i === 0 ? 'disabled style="opacity:0.3;cursor:default;font-size:10px;padding:0 4px;background:none;border:1px solid #ccc;border-radius:2px;"' : ''}>▲</button>
                <button type="button" data-fav-down="${i}" style="font-size:10px; cursor:pointer; padding:0 4px; background:none; border:1px solid #ccc; border-radius:2px;" ${i === favs.length - 1 ? 'disabled style="opacity:0.3;cursor:default;font-size:10px;padding:0 4px;background:none;border:1px solid #ccc;border-radius:2px;"' : ''}>▼</button>
                <button type="button" data-fav-del="${i}" style="font-size:10px; cursor:pointer; padding:0 4px; background:none; border:1px solid #dc3545; color:#dc3545; border-radius:2px;">×</button>
            </div>
        `).join('');

        // 单选切换目录
        container.querySelectorAll('input[name="offline115-fav"]').forEach(radio => {
            radio.onchange = () => {
                const cid = radio.value;
                const fav = STATE.offline115Favorites.find(f => f.cid === cid);
                if (fav) {
                    STATE.offline115Cid = cid;
                    STATE.offline115CidName = fav.name;
                    saveState('offline_115_cid', cid);
                    saveState('offline_115_cid_name', fav.name);
                    document.getElementById('offline115-cid').value = cid;
                    document.getElementById('offline115-cid-display').innerText = fav.name;
                }
            };
        });

        // 删除
        container.querySelectorAll('[data-fav-del]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.favDel);
                STATE.offline115Favorites.splice(idx, 1);
                saveState('offline_115_favorites', STATE.offline115Favorites);
                renderFavorites();
            };
        });

        // 上移
        container.querySelectorAll('[data-fav-up]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.favUp);
                if (idx <= 0) return;
                const tmp = STATE.offline115Favorites[idx];
                STATE.offline115Favorites[idx] = STATE.offline115Favorites[idx - 1];
                STATE.offline115Favorites[idx - 1] = tmp;
                saveState('offline_115_favorites', STATE.offline115Favorites);
                renderFavorites();
            };
        });

        // 下移
        container.querySelectorAll('[data-fav-down]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.favDown);
                if (idx >= STATE.offline115Favorites.length - 1) return;
                const tmp = STATE.offline115Favorites[idx];
                STATE.offline115Favorites[idx] = STATE.offline115Favorites[idx + 1];
                STATE.offline115Favorites[idx + 1] = tmp;
                saveState('offline_115_favorites', STATE.offline115Favorites);
                renderFavorites();
            };
        });
    };

    const addFavorite = (cid, name) => {
        if (STATE.offline115Favorites.some(f => f.cid === cid)) return false;
        STATE.offline115Favorites.push({ cid, name });
        saveState('offline_115_favorites', STATE.offline115Favorites);
        renderFavorites();
        return true;
    };

    const createFolderPicker = () => {
        const overlay = document.createElement('div');
        overlay.id = 'custom-115-folder-picker';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="fp-box">
                <div class="fp-header"><span>选择保存目录</span><span class="fp-close">&times;</span></div>
                <div class="fp-breadcrumb" id="fp-breadcrumb"></div>
                <div class="fp-list" id="fp-list"><div style="padding:16px; color:#999; text-align:center;">加载中...</div></div>
                <div class="fp-footer">
                    <button type="button" id="fp-cancel" style="background:#6c757d; color:#fff;">取消</button>
                    <button type="button" id="fp-confirm" style="background:#28a745; color:#fff;">确定选择</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let fpCidStack = [{ cid: '0', name: '根目录' }];
        let fpSelectedCid = '0';
        let fpSelectedName = '根目录';

        const renderBreadcrumb = () => {
            const bc = overlay.querySelector('#fp-breadcrumb');
            bc.innerHTML = fpCidStack.map((item, i) =>
                i < fpCidStack.length - 1
                    ? `<span data-idx="${i}">${item.name} /</span>`
                    : `<span style="color:#333; cursor:default;">${item.name}</span>`
            ).join('');
            bc.querySelectorAll('span[data-idx]').forEach(s => {
                s.onclick = () => {
                    const idx = parseInt(s.dataset.idx);
                    fpCidStack = fpCidStack.slice(0, idx + 1);
                    loadFolders(fpCidStack[fpCidStack.length - 1].cid);
                };
            });
        };

        const loadFolders = async (cid) => {
            const list = overlay.querySelector('#fp-list');
            list.innerHTML = '<div style="padding:16px; color:#999; text-align:center;">加载中...</div>';
            try {
                const folders = await offline115ListFolders(cid);
                if (folders.length === 0) {
                    list.innerHTML = '<div style="padding:16px; color:#999; text-align:center;">此文件夹为空</div>';
                } else {
                    list.innerHTML = folders.map(f => {
                        const name = (f.n || f.name || '未命名').replace(/"/g, '&quot;');
                        const isFav = STATE.offline115Favorites.some(fav => fav.cid === f.cid);
                        return `<div class="fp-item" data-cid="${f.cid}" data-name="${name}">
                            <span style="flex:1;">📁 ${name}</span>
                            <button type="button" data-fav-add="${f.cid}" data-fav-name="${name}" title="${isFav ? '已收藏' : '添加到常用'}"
                                style="font-size:14px; cursor:pointer; padding:0 6px; background:none; border:none; ${isFav ? 'color:#ffc107;' : 'color:#ccc;'}">${isFav ? '★' : '☆'}</button>
                        </div>`;
                    }).join('');
                    list.querySelectorAll('.fp-item').forEach(item => {
                        item.onclick = (e) => {
                            if (e.target.tagName === 'BUTTON') return;
                            list.querySelectorAll('.fp-item').forEach(el => el.classList.remove('fp-selected'));
                            item.classList.add('fp-selected');
                            fpSelectedCid = item.dataset.cid;
                            fpSelectedName = item.dataset.name;
                        };
                        item.ondblclick = (e) => {
                            if (e.target.tagName === 'BUTTON') return;
                            const newCid = item.dataset.cid;
                            const newName = item.dataset.name;
                            fpCidStack.push({ cid: newCid, name: newName });
                            renderBreadcrumb();
                            loadFolders(newCid);
                        };
                    });
                    // 收藏按钮
                    list.querySelectorAll('[data-fav-add]').forEach(btn => {
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            const cid = btn.dataset.favAdd;
                            const name = btn.dataset.favName;
                            const isFav = STATE.offline115Favorites.some(fav => fav.cid === cid);
                            if (isFav) {
                                STATE.offline115Favorites = STATE.offline115Favorites.filter(fav => fav.cid !== cid);
                                saveState('offline_115_favorites', STATE.offline115Favorites);
                                btn.innerText = '☆'; btn.style.color = '#ccc'; btn.title = '添加到常用';
                            } else {
                                addFavorite(cid, name);
                                    btn.innerText = '★'; btn.style.color = '#ffc107'; btn.title = '已收藏';
                            }
                        };
                    });
                }
            } catch (err) {
                list.innerHTML = `<div style="padding:16px; color:#dc3545; text-align:center;">加载失败: ${err.message}</div>`;
            }
        };

        renderBreadcrumb();
        loadFolders('0');

        overlay.querySelector('.fp-close').onclick = () => { overlay.style.display = 'none'; };
        overlay.querySelector('#fp-cancel').onclick = () => { overlay.style.display = 'none'; };
        overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

        overlay.querySelector('#fp-confirm').onclick = () => {
            document.getElementById('offline115-cid').value = fpSelectedCid;
            document.getElementById('offline115-cid-display').innerText = fpSelectedName;
            STATE.offline115Cid = fpSelectedCid;
            STATE.offline115CidName = fpSelectedName;
            saveState('offline_115_cid', fpSelectedCid);
            saveState('offline_115_cid_name', fpSelectedName);
            overlay.style.display = 'none';
            renderFavorites();
        };

        return overlay;
    };

    let folderPicker = null;

    // 绑定事件
    offline115Panel.querySelector('#offline115-pick-folder').onclick = () => {
        if (!folderPicker) folderPicker = createFolderPicker();
        folderPicker.style.display = 'flex';
    };

    offline115Panel.querySelector('#offline115-cid-display').onclick = () => {
        if (!folderPicker) folderPicker = createFolderPicker();
        folderPicker.style.display = 'flex';
    };

    // 初始化常用目录
    renderFavorites();

    // 日志辅助函数（限制行数）
    const logToPanel = (logEl, msg) => {
        if (!logEl) return;
        logEl.innerText += msg + '\n';
        // 限制行数
        const maxLines = STATE.offline115LogMaxLines || 100;
        const lines = logEl.innerText.split('\n');
        if (lines.length > maxLines) {
            logEl.innerText = lines.slice(lines.length - maxLines).join('\n');
        }
        logEl.scrollTop = logEl.scrollHeight;
    };

    // 配额显示与更新
    const updateQuotaDisplay = async () => {
        const quotaEl = offline115Panel.querySelector('#offline115-quota');
        if (!quotaEl) return;
        quotaEl.innerText = '配额查询中...';
        const quota = await offline115GetQuota();
        if (quota) {
            quotaEl.innerText = `📊 配额：剩 ${quota.remain} / 总 ${quota.total} 个${quota.maxSize ? ' (容量 ' + quota.maxSize + 'GB)' : ''}`;
            quotaEl.style.color = quota.remain < 100 ? '#dc3545' : quota.remain < 500 ? '#ffc107' : '#888';
        } else {
            quotaEl.innerText = '📊 配额获取失败（请确认已登录115）';
            quotaEl.style.color = '#dc3545';
        }
    };
    updateQuotaDisplay();

    // 自动保存输入框内容（跨会话持久化）
    const newFolderInput = offline115Panel.querySelector('#offline115-newfolder');
    const urlsTextarea = offline115Panel.querySelector('#offline115-urls');

    // 使用 input 事件实时保存，防抖 500ms
    let saveTimer = null;
    const autoSaveInputs = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveState('offline_115_new_folder', newFolderInput.value);
            saveState('offline_115_urls', urlsTextarea.value);
        }, 500);
    };
    newFolderInput.addEventListener('input', autoSaveInputs);
    urlsTextarea.addEventListener('input', autoSaveInputs);

    // 清除按钮
    offline115Panel.querySelector('#offline115-clear-folder').onclick = () => {
        newFolderInput.value = '';
        saveState('offline_115_new_folder', '');
    };
    offline115Panel.querySelector('#offline115-clear-urls').onclick = () => {
        urlsTextarea.value = '';
        saveState('offline_115_urls', '');
    };

    offline115Panel.querySelector('#offline115-push').onclick = async () => {
        const cidInput = document.getElementById('offline115-cid').value.trim();
        const newFolder = document.getElementById('offline115-newfolder').value.trim();
        const urlsText = document.getElementById('offline115-urls').value.trim();
        const logEl = document.getElementById('offline115-log');
        const pushBtn = document.getElementById('offline115-push');

        if (!urlsText) { logToPanel(logEl, '⚠️ 请输入至少一条链接'); return; }

        const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) { logToPanel(logEl, '⚠️ 请输入至少一条链接'); return; }

        pushBtn.disabled = true;
        pushBtn.innerText = '推送中...';
        logEl.innerText = '';

        let targetCid = cidInput || '0';

        // 如果指定了新文件夹名，先创建（已存在则查找其CID）
        if (newFolder) {
            logEl.innerText += `📁 正在创建文件夹「${newFolder}」...\n`;
            try {
                const createResp = await offline115CreateFolder(targetCid, newFolder);
                if (createResp.state && createResp.cid) {
                    targetCid = createResp.cid;
                    logEl.innerText += `✅ 文件夹创建成功 (CID: ${targetCid})\n`;
                } else if (createResp.errno === 20004 || (createResp.error && createResp.error.includes('已存在'))) {
                    // 文件夹已存在，查找其CID
                    logEl.innerText += `ℹ️ 文件夹已存在，正在查找...\n`;
                    const existingCid = await offline115FindFolder(targetCid, newFolder);
                    if (existingCid) {
                        targetCid = existingCid;
                        logEl.innerText += `✅ 找到已有文件夹 (CID: ${targetCid})\n`;
                    } else {
                        logEl.innerText += `⚠️ 未找到同名文件夹，将推送到当前目录\n`;
                    }
                } else {
                    logEl.innerText += `⚠️ 文件夹创建返回异常: ${JSON.stringify(createResp)}\n`;
                }
            } catch (err) {
                logEl.innerText += `❌ 文件夹创建失败: ${err.message}\n`;
            }
        }

        // 逐条推送
        let success = 0, fail = 0;
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const short = url.length > 60 ? url.substring(0, 60) + '...' : url;
            logEl.innerText += `[${i + 1}/${urls.length}] 推送: ${short}\n`;
            try {
                const resp = await offline115AddTask(url, targetCid);
                if (resp.state === true || resp.state === 'true') {
                    logEl.innerText += `  ✅ 成功\n`;
                    success++;
                } else if (resp.error_code === 10008) {
                    logEl.innerText += `  ⚠️ 任务已存在\n`;
                    success++;
                } else {
                    logEl.innerText += `  ❌ 失败: ${resp.error_msg || JSON.stringify(resp)}\n`;
                    fail++;
                }
            } catch (err) {
                logEl.innerText += `  ❌ 错误: ${err.message}\n`;
                fail++;
            }
            logEl.scrollTop = logEl.scrollHeight;
        }

        logEl.innerText += `\n🎉 推送完成：${success} 成功，${fail} 失败`;
        pushBtn.disabled = false;
        pushBtn.innerText = '☁️ 推送到115';

        // 推送完成后清空链接（保留新建文件夹名）
        urlsTextarea.value = '';
        saveState('offline_115_urls', '');
        updateQuotaDisplay();

        // 压缩包自动解压
        // TODO: 解压和重命名待修复后启用
        // await offline115ExtractArchives(urls, targetCid, (msg) => { logEl.innerText += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; });
        // await offline115AutoRename(targetCid, (msg) => { logEl.innerText += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; });
    };

    btnGroup.appendChild(btnToggleSet);
    btnGroup.appendChild(btnSelectAll);
    btnGroup.appendChild(btnExtract);
    btnGroup.appendChild(btnOpen);

    const btnOffline115 = createBtn('☁️ 115 离线下载', '#fd7e14');
    btnOffline115.onclick = () => offline115Panel.style.display = offline115Panel.style.display === 'none' ? 'flex' : 'none';
    btnGroup.appendChild(btnOffline115);

    panel.appendChild(settingsPanel);
    panel.appendChild(offline115Panel);
    panel.appendChild(btnGroup);
    document.body.appendChild(panel);

    // ================= 启动时自动全选并提取 =================
    if (STATE.autoExtractOnLoad) {
        setTimeout(() => {
            const visibleCbs = document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden) .custom-thread-checkbox');
            if (visibleCbs.length > 0) {
                visibleCbs.forEach(cb => { cb.checked = true; });
                btnExtract.click();
            }
        }, 800);
    }

    // ================= 启动时自动展开115面板 =================
    if (STATE.offline115AutoOpen) {
        offline115Panel.style.display = 'flex';
    }

    // ================= 帖子详情页：内联 TXT/ZIP 内容展示 =================
    const initDetailPage = async () => {
        const postList = document.querySelector('#postlist');
        if (!postList) return;
        // 排除列表页（有多个 normalthread tbody 的是列表页）
        if (document.querySelector('tbody[id^="normalthread_"]')) return;

        const toAbs = (raw) => { try { return new URL(raw, location.href).href; } catch(e) { return raw; } };
        const allMergedTexts = [];

        // 详情页推送函数（复用115面板的目录设置）
        const detailPushTo115 = async (links, btn) => {
            const cid = document.getElementById('offline115-cid')?.value?.trim() || '0';
            const newFolder = document.getElementById('offline115-newfolder')?.value?.trim() || '';
            const logEl = document.getElementById('offline115-log');
            btn.disabled = true;
            const origText = btn.innerText;
            btn.innerText = '推送中...';

            const log = (msg) => {
                if (logEl) { logEl.innerText += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; }
            };

            log(`\n--- 从帖子详情推送 (${links.length} 条) ---`);

            let targetCid = cid;
            if (newFolder) {
                log(`📁 创建文件夹「${newFolder}」...`);
                try {
                    const createResp = await offline115CreateFolder(targetCid, newFolder);
                    if (createResp.state && createResp.cid) {
                        targetCid = createResp.cid;
                        log(`✅ 文件夹创建成功 (CID: ${targetCid})`);
                    } else if (createResp.errno === 20004 || (createResp.error && createResp.error.includes('已存在'))) {
                        log(`ℹ️ 文件夹已存在，查找中...`);
                        const existingCid = await offline115FindFolder(targetCid, newFolder);
                        if (existingCid) { targetCid = existingCid; log(`✅ 找到已有文件夹 (CID: ${targetCid})`); }
                    }
                } catch (e) { log(`⚠️ 文件夹处理失败: ${e.message}`); }
            }

            let ok = 0, fail = 0;
            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                const short = link.length > 60 ? link.substring(0, 60) + '...' : link;
                try {
                    const resp = await offline115AddTask(link, targetCid);
                    if (resp.state === true || resp.state === 'true' || resp.error_code === 10008) {
                        ok++; log(`  [${i+1}/${links.length}] ✅ ${short}`);
                    } else {
                        fail++; log(`  [${i+1}/${links.length}] ❌ ${resp.error_msg || '失败'}`);
                    }
                } catch (e) { fail++; log(`  [${i+1}/${links.length}] ❌ ${e.message}`); }
            }
            log(`🎉 推送完成：${ok} 成功，${fail} 失败`);
            btn.innerText = `✅ ${ok}/${links.length}`;
            setTimeout(() => { btn.innerText = origText; btn.disabled = false; }, 3000);
            // 自动解压 + 重命名
            // TODO: 解压和重命名待修复后启用
            // await offline115ExtractArchives(links, targetCid, log);
            // await offline115AutoRename(targetCid, log);
            // 刷新配额
            const quotaEl = document.getElementById('offline115-quota');
            if (quotaEl) {
                const quota = await offline115GetQuota();
                if (quota) {
                    quotaEl.innerText = `📊 配额：剩 ${quota.remain} / 总 ${quota.total} 个${quota.maxSize ? ' (容量 ' + quota.maxSize + 'GB)' : ''}`;
                    quotaEl.style.color = quota.remain < 100 ? '#dc3545' : quota.remain < 500 ? '#ffc107' : '#888';
                }
            }
        };

        // 遍历所有楼层
        const posts = postList.querySelectorAll('div[id^="post_"]');
        for (const post of posts) {
            const contentEl = post.querySelector('.t_f, .pcb');
            if (!contentEl) continue;

            const seenUrls = new Set();
            const linkEls = [];

            // 收集 txt / zip / rar / 7z 链接
            contentEl.querySelectorAll('a[href$=".txt"], a[href$=".TXT"], a[href$=".zip"], a[href$=".ZIP"], a[href$=".rar"], a[href$=".RAR"], a[href$=".7z"], a[href$=".7Z"], a[href*="mod=attachment"]').forEach(a => {
                const href = toAbs(a.getAttribute('href'));
                if (seenUrls.has(href)) return;
                const text = a.innerText.trim() + ' ' + (a.nextElementSibling ? a.nextElementSibling.innerText : '');
                if (text.includes('.txt') || href.toLowerCase().endsWith('.txt')) {
                    seenUrls.add(href);
                    linkEls.push({ el: a, href, name: text.trim() || '文本文件', type: 'txt' });
                } else if (/\.(zip|rar|7z)$/i.test(href) || /\.(zip|rar|7z)/i.test(text)) {
                    seenUrls.add(href);
                    const ext = href.match(/\.(zip|rar|7z)$/i)?.[1]?.toLowerCase() || 'zip';
                    linkEls.push({ el: a, href, name: text.trim() || '压缩包', type: ext });
                }
            });

            // 扫描 magnet / ed2k 直链，添加内联推送按钮
            const magnetRegex2 = /magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}/gi;
            const ed2kRegex2 = /ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|/gi;
            const combinedRegex = new RegExp(`(${magnetRegex2.source}|${ed2kRegex2.source})`, 'gi');
            const pushSeen2 = new Set();

            // 创建推送按钮的工厂函数
            const createPushBtn = (href) => {
                if (pushSeen2.has(href)) return null;
                pushSeen2.add(href);
                const pushBtn = document.createElement('button');
                pushBtn.type = 'button';
                pushBtn.innerText = '☁️';
                pushBtn.style.cssText = 'display:inline-block; font-size:12px; cursor:pointer; padding:0 4px; margin-left:3px; background:#fd7e14; color:#fff; border:none; border-radius:2px; vertical-align:baseline; line-height:1.4;';
                pushBtn.title = '推送到115';
                pushBtn.onclick = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    detailPushTo115([href], pushBtn);
                };
                return pushBtn;
            };

            // 1. <a> 标签形式的 magnet/ed2k 链接 → 紧贴链接右侧
            contentEl.querySelectorAll('a[href^="magnet:"], a[href^="MAGNET:"], a[href^="ed2k://"], a[href^="ED2K://"]').forEach(a => {
                const btn = createPushBtn(a.href);
                if (btn) {
                    // 用 inline span 包裹链接和按钮，确保在同一行
                    const wrapper = document.createElement('span');
                    wrapper.style.cssText = 'display:inline; white-space:nowrap;';
                    a.parentNode.insertBefore(wrapper, a);
                    wrapper.appendChild(a);
                    wrapper.appendChild(btn);
                }
            });

            // 2. 纯文本中的 magnet/ed2k 链接 → 用 TreeWalker 找到文本节点，精确插入
            const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
            const textNodesToProcess = [];
            while (walker.nextNode()) {
                const node = walker.currentNode;
                // 跳过 <a> 标签内部的文本（上面已处理）
                if (node.parentNode.tagName === 'A') continue;
                // 跳过 <script> / <style>
                const parentTag = node.parentNode.tagName;
                if (parentTag === 'SCRIPT' || parentTag === 'STYLE') continue;
                if (combinedRegex.test(node.nodeValue)) {
                    textNodesToProcess.push(node);
                }
                combinedRegex.lastIndex = 0;
            }

            for (const textNode of textNodesToProcess) {
                const text = textNode.nodeValue;
                const parent = textNode.parentNode;
                combinedRegex.lastIndex = 0;
                let lastIndex = 0;
                let match;
                const fragment = document.createDocumentFragment();

                while ((match = combinedRegex.exec(text)) !== null) {
                    // 添加链接前的普通文本
                    if (match.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                    }
                    // 创建链接文本 span
                    const linkSpan = document.createElement('span');
                    linkSpan.style.cssText = 'color:#007bff; word-break:break-all;';
                    linkSpan.textContent = match[0];
                    fragment.appendChild(linkSpan);
                    // 紧接着插入推送按钮
                    const btn = createPushBtn(match[0]);
                    if (btn) fragment.appendChild(btn);
                    lastIndex = match.index + match[0].length;
                }
                // 添加剩余文本
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                // 替换原文本节点
                parent.replaceChild(fragment, textNode);
            }

            if (linkEls.length === 0 && pushSeen2.size === 0) continue;

            // 逐个处理：内联显示在链接下方 + 收集到全局
            for (const info of linkEls) {
                let content = null;

                if (info.type === 'txt') {
                    try {
                        content = await fetchTxtContent(info.href);
                    } catch (err) {
                        content = `[读取失败: ${err.message}]`;
                    }
                } else if (info.type === 'zip') {
                    try {
                        const result = await fetchAndExtractArchive(info.href, 'zip');
                        if (result.error) {
                            content = `[${result.error}]`;
                        } else if (result.txtFiles && result.txtFiles.length > 0) {
                            content = result.txtFiles.map(tf =>
                                `━━ ${tf.filename} ━━\n${tf.content}`
                            ).join('\n\n');
                        } else {
                            content = '[压缩包内未找到 .txt 文件]';
                        }
                    } catch (err) {
                        content = `[解压失败: ${err.message}]`;
                    }
                } else {
                    content = `[${info.type.toUpperCase()} 格式需在本地解压，浏览器无法直接处理]`;
                }

                if (content) {
                    allMergedTexts.push({ name: info.name, content });

                    // 从内容中提取离线链接
                    const magnetMatches = content.match(/magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}/gi) || [];
                    const ed2kMatches = content.match(/ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|/gi) || [];
                    const extractedLinks = [...new Set([...magnetMatches, ...ed2kMatches])];

                    // ---- 内联展示：在链接正下方插入 ----
                    const inlineWrap = document.createElement('div');
                    inlineWrap.style.cssText = 'margin:6px 0; border:1px solid #dee2e6; border-radius:4px; padding:8px; background:#fdfdfd;';

                    const inlineHeader = document.createElement('div');
                    inlineHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; flex-wrap:wrap; gap:4px;';
                    const icon = info.type === 'txt' ? '📄' : '📦';
                    const inlineTitle = document.createElement('span');
                    inlineTitle.style.cssText = 'font-size:12px; font-weight:bold; color:#495057;';
                    inlineTitle.innerText = `${icon} ${info.name}`;
                    inlineHeader.appendChild(inlineTitle);

                    const inlineBtnRow = document.createElement('div');
                    inlineBtnRow.style.cssText = 'display:flex; gap:4px;';
                    const inlineCopyBtn = document.createElement('button');
                    inlineCopyBtn.type = 'button'; inlineCopyBtn.innerText = '复制';
                    inlineCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px;';
                    inlineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(content).then(() => { inlineCopyBtn.innerText = '已复制'; setTimeout(() => inlineCopyBtn.innerText = '复制', 2000); }); };
                    inlineBtnRow.appendChild(inlineCopyBtn);

                    // 如果内容中有离线链接，添加推送按钮
                    if (extractedLinks.length > 0) {
                        const inlinePushBtn = document.createElement('button');
                        inlinePushBtn.type = 'button'; inlinePushBtn.innerText = `☁️ 推送${extractedLinks.length}条到115`;
                        inlinePushBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                        inlinePushBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); detailPushTo115(extractedLinks, inlinePushBtn); };
                        inlineBtnRow.appendChild(inlinePushBtn);
                    }

                    inlineHeader.appendChild(inlineBtnRow);
                    inlineWrap.appendChild(inlineHeader);

                    const inlinePre = document.createElement('pre');
                    inlinePre.textContent = content;
                    inlinePre.style.cssText = 'max-height:200px; overflow-y:auto; background:#f8f9fa; padding:8px; border-radius:3px; font-size:11px; white-space:pre-wrap; word-break:break-all; margin:0;';
                    inlineWrap.appendChild(inlinePre);

                    if (content.length > 500) {
                        const inlineToggle = document.createElement('button');
                        inlineToggle.type = 'button'; inlineToggle.innerText = '展开全文';
                        inlineToggle.style.cssText = 'font-size:11px; margin-top:4px; cursor:pointer; padding:2px 8px; background:#e9ecef; border:1px solid #ccc; border-radius:3px;';
                        inlineToggle.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (inlinePre.style.maxHeight === '200px') { inlinePre.style.maxHeight = 'none'; inlineToggle.innerText = '收起'; } else { inlinePre.style.maxHeight = '200px'; inlineToggle.innerText = '展开全文'; } };
                        inlineWrap.appendChild(inlineToggle);
                    }

                    // 插入到链接的下一个兄弟节点之后
                    info.el.parentNode.insertBefore(inlineWrap, info.el.nextSibling.nextSibling || info.el.nextSibling);
                }
            }
        }

        // ---- 页面顶部：合并所有内容 ----
        if (allMergedTexts.length > 0) {
            const mergedContent = allMergedTexts.map(t =>
                `━━━━ ${t.name} ━━━━\n${t.content}`
            ).join('\n\n');

            // 从所有内容中提取离线链接
            const allExtractedLinks = [];
            allMergedTexts.forEach(t => {
                const magnetMatches = t.content.match(/magnet:\?xt=urn:btih:[0-9a-zA-Z]{32,40}/gi) || [];
                const ed2kMatches = t.content.match(/ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|/gi) || [];
                [...magnetMatches, ...ed2kMatches].forEach(link => {
                    if (!allExtractedLinks.includes(link)) allExtractedLinks.push(link);
                });
            });

            const topWrap = document.createElement('div');
            topWrap.style.cssText = 'max-width:980px; margin:0 auto 16px; border:2px solid #ffc107; border-radius:6px; padding:12px; background:#fffdf5;';

            const topHeader = document.createElement('div');
            topHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:8px;';
            const topTitle = document.createElement('span');
            topTitle.style.cssText = 'font-size:14px; font-weight:bold; color:#495057;';
            topTitle.innerText = `📄 本帖 TXT/ZIP 内容汇总 (${allMergedTexts.length} 个文件${allExtractedLinks.length > 0 ? '，' + allExtractedLinks.length + ' 条离线链接' : ''})`;
            topHeader.appendChild(topTitle);

            const topBtnRow = document.createElement('div');
            topBtnRow.style.cssText = 'display:flex; gap:6px;';

            const topCopyBtn = document.createElement('button');
            topCopyBtn.type = 'button'; topCopyBtn.innerText = '复制全部';
            topCopyBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 12px; background:#6c757d; color:#fff; border:none; border-radius:3px; font-weight:bold;';
            topCopyBtn.onclick = () => { navigator.clipboard.writeText(mergedContent).then(() => { topCopyBtn.innerText = '已复制'; setTimeout(() => topCopyBtn.innerText = '复制全部', 2000); }); };
            topBtnRow.appendChild(topCopyBtn);

            if (allExtractedLinks.length > 0) {
                const topPushAllBtn = document.createElement('button');
                topPushAllBtn.type = 'button'; topPushAllBtn.innerText = `☁️ 一键推送全部 (${allExtractedLinks.length})`;
                topPushAllBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 12px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                topPushAllBtn.onclick = () => { detailPushTo115(allExtractedLinks, topPushAllBtn); };
                topBtnRow.appendChild(topPushAllBtn);
            }

            topHeader.appendChild(topBtnRow);
            topWrap.appendChild(topHeader);

            // 逐行链接 + 推送按钮
            if (allExtractedLinks.length > 0) {
                const linkListDiv = document.createElement('div');
                linkListDiv.style.cssText = 'max-height:200px; overflow-y:auto; background:#f8f9fa; padding:8px; border-radius:4px; margin-bottom:8px;';
                allExtractedLinks.forEach(link => {
                    const lineDiv = document.createElement('div');
                    lineDiv.style.cssText = 'display:flex; align-items:center; gap:4px; padding:2px 0; border-bottom:1px solid #eee;';
                    const linkText = document.createElement('span');
                    linkText.style.cssText = 'flex:1; font-size:11px; word-break:break-all; font-family:monospace;';
                    linkText.innerText = link;
                    lineDiv.appendChild(linkText);

                    const lineCopyBtn = document.createElement('button');
                    lineCopyBtn.type = 'button'; lineCopyBtn.innerText = '复制';
                    lineCopyBtn.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#6c757d; color:#fff; border:none; border-radius:2px; flex-shrink:0;';
                    lineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(link).then(() => { lineCopyBtn.innerText = '已复制'; setTimeout(() => lineCopyBtn.innerText = '复制', 1500); }); };
                    lineDiv.appendChild(lineCopyBtn);

                    const linePushBtn = document.createElement('button');
                    linePushBtn.type = 'button'; linePushBtn.innerText = '☁️';
                    linePushBtn.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#fd7e14; color:#fff; border:none; border-radius:2px; flex-shrink:0;';
                    linePushBtn.title = '推送到115';
                    linePushBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); detailPushTo115([link], linePushBtn); };
                    lineDiv.appendChild(linePushBtn);

                    linkListDiv.appendChild(lineDiv);
                });
                topWrap.appendChild(linkListDiv);
            }

            const topPre = document.createElement('pre');
            topPre.textContent = mergedContent;
            topPre.style.cssText = 'max-height:300px; overflow-y:auto; background:#f8f9fa; padding:10px; border-radius:4px; font-size:12px; white-space:pre-wrap; word-break:break-all; margin:0;';
            topWrap.appendChild(topPre);

            if (mergedContent.length > 800) {
                const topToggle = document.createElement('button');
                topToggle.type = 'button'; topToggle.innerText = '展开全文';
                topToggle.style.cssText = 'font-size:12px; margin-top:6px; cursor:pointer; padding:4px 12px; background:#e9ecef; border:1px solid #ccc; border-radius:3px;';
                topToggle.onclick = () => { if (topPre.style.maxHeight === '300px') { topPre.style.maxHeight = 'none'; topToggle.innerText = '收起'; } else { topPre.style.maxHeight = '300px'; topToggle.innerText = '展开全文'; } };
                topWrap.appendChild(topToggle);
            }

            // 插入到页面顶部
            const insertTarget = postList.parentNode || document.body;
            insertTarget.insertBefore(topWrap, postList);
        }
    };

    // 仅在详情页执行（非列表页）
    if (!document.querySelector('tbody[id^="normalthread_"]')) {
        initDetailPage();
    }

})();