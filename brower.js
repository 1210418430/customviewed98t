// ==UserScript==
// @name         论坛小脚本-全能看帖与提取辅助
// @namespace    http://tampermonkey.net/
// @version      13.1
// @description  无缝翻页、悬浮预览、资源提取、屏蔽高亮关键词、按用户/UID屏蔽、已读记忆、修复复制Bug
// @author       鲜切红薯片
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
            position: absolute; top: 0; height: 100%; width: 33.33%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        #custom-img-lightbox .custom-lb-zone:hover { background: rgba(255,255,255,0.08); }
        #custom-img-lightbox .custom-lb-zone-left { left: 0; }
        #custom-img-lightbox .custom-lb-zone-center { left: 33.33%; }
        #custom-img-lightbox .custom-lb-zone-right { left: 66.66%; }
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
    `);

    const tooltip = document.createElement('div');
    tooltip.id = 'custom-hover-tooltip';
    document.body.appendChild(tooltip);

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
        if (!tbody || tbody.querySelector('.custom-extracted')) return;

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
                btnReply.innerText = '💬 去回复';
                btnReply.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#28a745; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                btnReply.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    GM_openInTab(data.locked.replyUrl, { active: true, insert: true });
                };
                btnRow.appendChild(btnReply);
            }

            const btnRefresh = document.createElement('button');
            btnRefresh.type = 'button';
            btnRefresh.innerText = '🔄 已回复，刷新查看';
            btnRefresh.style.cssText = 'font-size:12px; cursor:pointer; padding:5px 12px; background:#007bff; color:#fff; border:none; border-radius:3px; font-weight:bold;';
            btnRefresh.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                btnRefresh.innerText = '正在刷新...';
                btnRefresh.disabled = true;
                // 清除缓存
                delete STATE.threadCache[threadUrl];
                // 移除旧结果
                const oldBox = tbody.querySelector('.custom-extracted');
                if (oldBox) oldBox.remove();
                // 重新提取
                await extractSingleThread(cb);
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

            // 链接合并文本框
            if (allLinks.length > 0) {
                const linkContent = allLinks.join('\n');
                const linkWrap = document.createElement('div');
                linkWrap.style.cssText = 'border:1px solid #dee2e6; border-radius:4px; padding:8px; background:#fdfdfd;';
                const linkHeader = document.createElement('div');
                linkHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;';
                linkHeader.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#495057;">🔗 链接 (${allLinks.length} 条：${data.magnets.length} 磁力 / ${data.ed2ks.length} ed2k / ${data.torrents.length} 种子)</span>`;
                const linkCopyBtn = document.createElement('button');
                linkCopyBtn.type = 'button'; linkCopyBtn.innerText = '复制全部链接';
                linkCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px;';
                linkCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(linkContent).then(() => { linkCopyBtn.innerText = '已复制'; setTimeout(() => linkCopyBtn.innerText = '复制全部链接', 2000); }); };
                linkHeader.appendChild(linkCopyBtn);
                linkWrap.appendChild(linkHeader);
                const linkPre = document.createElement('pre');
                linkPre.textContent = linkContent;
                linkPre.style.cssText = 'max-height:200px; overflow-y:auto; background:#f8f9fa; padding:8px; border-radius:3px; font-size:11px; white-space:pre-wrap; word-break:break-all; margin:0;';
                linkWrap.appendChild(linkPre);
                if (linkContent.length > 500) {
                    const linkToggle = document.createElement('button');
                    linkToggle.type = 'button'; linkToggle.innerText = '展开全文';
                    linkToggle.style.cssText = 'font-size:11px; margin-top:4px; cursor:pointer; padding:2px 8px; background:#e9ecef; border:1px solid #ccc; border-radius:3px;';
                    linkToggle.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (linkPre.style.maxHeight === '200px') { linkPre.style.maxHeight = 'none'; linkToggle.innerText = '收起'; } else { linkPre.style.maxHeight = '200px'; linkToggle.innerText = '展开全文'; } };
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

    btnGroup.appendChild(btnToggleSet);
    btnGroup.appendChild(btnSelectAll);
    btnGroup.appendChild(btnExtract);
    btnGroup.appendChild(btnOpen);

    panel.appendChild(settingsPanel);
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

    // ================= 帖子详情页：内联 TXT/ZIP 内容展示 =================
    const initDetailPage = async () => {
        const postList = document.querySelector('#postlist');
        if (!postList) return;
        // 排除列表页（有多个 normalthread tbody 的是列表页）
        if (document.querySelector('tbody[id^="normalthread_"]')) return;

        const toAbs = (raw) => { try { return new URL(raw, location.href).href; } catch(e) { return raw; } };
        const allMergedTexts = [];

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

            if (linkEls.length === 0) continue;

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

                    // ---- 内联展示：在链接正下方插入 ----
                    const inlineWrap = document.createElement('div');
                    inlineWrap.style.cssText = 'margin:6px 0; border:1px solid #dee2e6; border-radius:4px; padding:8px; background:#fdfdfd;';

                    const inlineHeader = document.createElement('div');
                    inlineHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;';
                    const icon = info.type === 'txt' ? '📄' : '📦';
                    inlineHeader.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#495057;">${icon} ${info.name.replace(/</g, '&lt;')}</span>`;
                    const inlineCopyBtn = document.createElement('button');
                    inlineCopyBtn.type = 'button'; inlineCopyBtn.innerText = '复制';
                    inlineCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px;';
                    inlineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(content).then(() => { inlineCopyBtn.innerText = '已复制'; setTimeout(() => inlineCopyBtn.innerText = '复制', 2000); }); };
                    inlineHeader.appendChild(inlineCopyBtn);
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

            const topWrap = document.createElement('div');
            topWrap.style.cssText = 'max-width:980px; margin:0 auto 16px; border:2px solid #ffc107; border-radius:6px; padding:12px; background:#fffdf5;';

            const topHeader = document.createElement('div');
            topHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;';
            topHeader.innerHTML = `<span style="font-size:14px; font-weight:bold; color:#495057;">📄 本帖 TXT/ZIP 内容汇总 (${allMergedTexts.length} 个文件)</span>`;

            const topCopyBtn = document.createElement('button');
            topCopyBtn.type = 'button'; topCopyBtn.innerText = '复制全部';
            topCopyBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 12px; background:#6c757d; color:#fff; border:none; border-radius:3px; font-weight:bold;';
            topCopyBtn.onclick = () => { navigator.clipboard.writeText(mergedContent).then(() => { topCopyBtn.innerText = '已复制'; setTimeout(() => topCopyBtn.innerText = '复制全部', 2000); }); };
            topHeader.appendChild(topCopyBtn);
            topWrap.appendChild(topHeader);

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