// ==UserScript==
// @name         论坛小脚本-全能看帖与提取辅助
// @namespace    http://tampermonkey.net/
// @version      15.6
// @description  无缝翻页、悬浮预览、资源提取、屏蔽高亮关键词、按用户/UID屏蔽、已读记忆、修复复制Bug、115离线下载、书签收藏与云备份
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
// @match        *://192.168.0.88:14000/*
// @match        *://*.sehuatang.org/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://lib.baomitu.com/jszip/3.10.1/jszip.min.js
// @downloadURL https://raw.githubusercontent.com/1210418430/customviewed98t/master/brower.js
// @updateURL https://raw.githubusercontent.com/1210418430/customviewed98t/master/brower.js
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
        imageDisplayMode: GM_getValue('custom_image_display_mode', 'stack'), // 'stack' | 'scroll' 图片展示方式
        buttonStyle: GM_getValue('custom_button_style', 'rect'), // 'rect' | 'circle' 收藏/打开按钮样式
        scrollBallEnabled: GM_getValue('custom_scroll_ball_enabled', true),
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
        resetWidth: GM_getValue('custom_reset_width', false),
        resetWidthPx: GM_getValue('custom_reset_width_px', 1500),
        hiddenTids: GM_getValue('custom_hidden_tids', []),
        hiddenTidsMaxDays: GM_getValue('custom_hidden_tids_max_days', 30),
        panelMinimized: false,
        panelStartMinimized: GM_getValue('custom_panel_start_minimized', false),
        panelPosition: GM_getValue('custom_panel_position', 'bottom-right'), // 'bottom-right' | 'center' | 'top-left'
        dashboardPosition: GM_getValue('custom_dashboard_position', 'center'), // 'center' | 'bottom-right' | 'top-left'
        bulkLoadPageCount: GM_getValue('custom_bulk_load_count', 3),
        autoBulkLoadOnPageLoad: GM_getValue('custom_auto_bulk_load', false),
        gistToken: GM_getValue('custom_gist_token', ''),
        gistId: GM_getValue('custom_gist_id', ''),
        gistBackupEnabled: GM_getValue('custom_gist_backup_enabled', false),
        bookmarks: GM_getValue('custom_bookmarks', []),
        bookmarksGistBackupEnabled: GM_getValue('custom_bookmarks_gist_backup', false),
        bookmarksPanelActiveTab: GM_getValue('custom_bookmarks_active_tab', 'important'),
        dashboardX: GM_getValue('custom_dashboard_x', null),
        dashboardY: GM_getValue('custom_dashboard_y', null),
        dashboardW: GM_getValue('custom_dashboard_w', 750),
        dashboardH: GM_getValue('custom_dashboard_h', 520),
        scrollBallX: GM_getValue('custom_scroll_ball_x', null),
        scrollBallY: GM_getValue('custom_scroll_ball_y', null),
        scrollSpeed1: GM_getValue('custom_scroll_speed_1', 80),
        scrollSpeed2: GM_getValue('custom_scroll_speed_2', 200),
        scrollSpeed3: GM_getValue('custom_scroll_speed_3', 400),
        scrollMaxSpeed: GM_getValue('custom_scroll_max_speed', 600),
        scrollSensitivity: GM_getValue('custom_scroll_sensitivity', 2),
        threadCache: {},
        isLoadingNextPage: false,
        nextPageUrl: document.querySelector('a.nxt') ? document.querySelector('a.nxt').href : null
    };

    if (!Array.isArray(STATE.blocked)) STATE.blocked = [];
    if (!Array.isArray(STATE.blockedUsers)) STATE.blockedUsers = [];
    if (!Array.isArray(STATE.highlighted)) STATE.highlighted = [];
    if (!Array.isArray(STATE.readLinks)) STATE.readLinks = [];
    if (!Array.isArray(STATE.hiddenTids)) STATE.hiddenTids = [];
    if (!Array.isArray(STATE.bookmarks)) STATE.bookmarks = [];
    STATE.tempUnhiddenSet = new Set(); // 会话级临时解除隐藏，刷新后恢复

    // ================= 书签操作 =================
    const addBookmark = (tid, title, url, type) => {
        const idx = STATE.bookmarks.findIndex(b => b.tid === tid);
        const now = Date.now();
        if (idx >= 0) {
            STATE.bookmarks[idx].type = type;
            STATE.bookmarks[idx].addedAt = now;
            STATE.bookmarks[idx].title = title;
            STATE.bookmarks[idx].url = url;
        } else {
            STATE.bookmarks.push({ tid, title, url, type, addedAt: now });
        }
        saveState('custom_bookmarks', STATE.bookmarks);
        if (STATE.bookmarksGistBackupEnabled && STATE.gistToken) {
            setTimeout(() => gistBookmarksBackup(true), 2000);
        }
        return idx >= 0 ? 'updated' : 'added';
    };
    const removeBookmark = (tid) => {
        STATE.bookmarks = STATE.bookmarks.filter(b => b.tid !== tid);
        saveState('custom_bookmarks', STATE.bookmarks);
        if (STATE.bookmarksGistBackupEnabled && STATE.gistToken) {
            setTimeout(() => gistBookmarksBackup(true), 2000);
        }
    };
    const isBookmarked = (tid) => STATE.bookmarks.some(b => b.tid === tid);
    const getBookmarkType = (tid) => {
        const b = STATE.bookmarks.find(b => b.tid === tid);
        return b ? b.type : null;
    };

    const saveState = (key, value) => { GM_setValue(key, value); };

    // 自动清理过期记录 + 构建 Set 加速查找
    const HIDDEN_TID_SET = new Set();
    (function _cleanupHiddenTids() {
        const now = Date.now();
        const maxAge = (STATE.hiddenTidsMaxDays || 30) * 86400000;
        // 旧格式兼容：纯 tid 字符串转新格式 [tid, ts]
        STATE.hiddenTids = STATE.hiddenTids.map(entry =>
            Array.isArray(entry) ? entry : [entry, now]
        ).filter(entry => {
            if (now - entry[1] > maxAge) return false;
            HIDDEN_TID_SET.add('tid=' + entry[0]);
            return true;
        });
        saveState('custom_hidden_tids', STATE.hiddenTids);
    })();
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
        .custom-persistent-toast {
            position: fixed; bottom: 80px; right: 60px; z-index: 310000; color: #fff;
            padding: 10px 14px; border-radius: 6px; font-size: 13px; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 520px; min-width: 260px;
            word-break: break-word; display: flex; align-items: flex-start; gap: 8px;
            transition: opacity 0.3s; pointer-events: auto;
        }
        .custom-persistent-toast .pt-msg { flex: 1; line-height: 1.5; }
        .custom-persistent-toast .pt-btn {
            flex-shrink: 0; cursor: pointer; border: 1px solid rgba(255,255,255,0.5);
            border-radius: 3px; color: #fff; font-size: 12px; padding: 2px 6px;
            line-height: 1.4; white-space: nowrap;
        }
        .custom-persistent-toast .pt-btn:hover { background: rgba(255,255,255,0.2); }
        /* 移动端：标题列最小宽度防止塌缩 */
        @media (max-width: 768px) {
            tbody[id^="normalthread_"] th { min-width: 120px; }
            tbody[id^="normalthread_"] th a.xst,
            tbody[id^="normalthread_"] th a[href*="thread-"] {
                word-break: break-word; white-space: normal;
            }
            /* 提取区图片适配移动端宽度 */
            .custom-extracted img {
                max-width: 100% !important; height: auto !important;
            }
            .custom-extracted {
                padding-left: 8px !important;
            }
            /* 按钮行移动端不换行溢出处理 */
            .custom-extracted > div[style*="display:flex"] {
                flex-wrap: wrap !important;
            }
        }
    `);

    const tooltip = document.createElement('div');
    tooltip.id = 'custom-hover-tooltip';
    document.body.appendChild(tooltip);

    // ================= Toast 提示 =================
    const showToast = (msg, type = 'success') => {
        const toast = document.createElement('div');
        const bg = type === 'success' ? '#52c41a' : type === 'error' ? '#dc3545' : '#1890ff';
        toast.style.cssText = `position:fixed; bottom:80px; right:60px; z-index:300000; background:${bg}; color:#fff; padding:10px 18px; border-radius:6px; font-size:13px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:opacity 0.5s; max-width:480px; word-break:break-word;`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        // 日志类消息显示更久，方便阅读
        const delay = type === 'info' ? 4000 : 2500;
        setTimeout(() => { toast.style.opacity = '0'; }, delay);
        setTimeout(() => { toast.remove(); }, delay + 500);
    };

    // 持久化 Toast：手动关闭 + 可复制，用于 Gist 备份等关键操作反馈
    let _persistentToastStack = 0;
    const showPersistentToast = (msg, type = 'success') => {
        const bg = type === 'success' ? '#52c41a' : type === 'error' ? '#dc3545' : '#1890ff';
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        const toast = document.createElement('div');
        toast.className = 'custom-persistent-toast';
        toast.style.background = bg;
        // 安全构建 DOM，避免 msg 中的 HTML 破坏结构
        const msgSpan = document.createElement('span');
        msgSpan.className = 'pt-msg';
        msgSpan.textContent = icon + ' ' + msg;
        toast.appendChild(msgSpan);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'pt-btn pt-copy-btn';
        copyBtn.title = '复制消息内容';
        copyBtn.style.background = 'transparent';
        copyBtn.textContent = '📋';
        toast.appendChild(copyBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pt-btn pt-close-btn';
        closeBtn.title = '关闭';
        closeBtn.style.background = 'transparent';
        closeBtn.textContent = '✕';
        toast.appendChild(closeBtn);

        // 多个消息自动错位
        _persistentToastStack++;
        const offset = (_persistentToastStack - 1) * 8;
        toast.style.bottom = (80 + offset) + 'px';
        toast.style.right = (60 + offset) + 'px';

        // 复制按钮
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(msg).then(() => showToast('已复制', 'success'));
        };
        // 关闭按钮
        const closeToast = () => {
            _persistentToastStack--;
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeToast();
        };
        // 点击消息区域也能关闭
        toast.addEventListener('click', (e) => {
            if (e.target === toast || e.target.classList.contains('pt-msg')) closeToast();
        });
        document.body.appendChild(toast);
        return toast;
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
        if (typeof GM_xmlhttpRequest !== 'function') {
            reject(new Error('GM_xmlhttpRequest 不可用'));
            return;
        }
        console.log('[gmFetch] 尝试请求:', url);
        const doRequest = (useCookie) => {
            const opts = {
                method: 'GET',
                url: url,
                responseType: responseType,
                timeout: responseType === 'blob' || responseType === 'arraybuffer' ? 60000 : 30000,
                headers: {
                    'Referer': location.href,
                    'User-Agent': navigator.userAgent
                },
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
                    if (useCookie) {
                        console.log('[gmFetch] 带 cookie 失败，尝试不带 cookie...');
                        doRequest(false);
                    } else {
                        reject(new Error('网络错误'));
                    }
                },
                ontimeout: () => reject(new Error('请求超时'))
            };
            if (useCookie && document.cookie) {
                opts.cookie = document.cookie;
            }
            GM_xmlhttpRequest(opts);
        };
        doRequest(true);
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
        // XHR 请求（移动端最可靠，且可自定义 Referer）
        const xhrFetch = (u) => new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', u, true);
            xhr.responseType = 'text';
            xhr.timeout = 45000;
            xhr.withCredentials = true;
            xhr.setRequestHeader('Accept', 'text/plain, */*');
            try { xhr.setRequestHeader('Referer', location.href); } catch(e) {}
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 400) {
                    resolve({ text: xhr.responseText, contentType: xhr.getResponseHeader('Content-Type') || '' });
                } else if (xhr.status === 0) {
                    reject(new Error('XHR status 0 (CORS/网络)'));
                } else {
                    reject(new Error(`XHR HTTP ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('XHR onerror'));
            xhr.ontimeout = () => reject(new Error('XHR timeout'));
            xhr.send();
        });

        // 带重试的请求
        const tryFetch = async (attempt) => {
            const errs = [];
            // 尝试1: fetch with credentials
            try {
                const resp = await fetch(url, { credentials: 'include', cache: 'no-cache' });
                if (!resp.ok) throw new Error(`fetch HTTP ${resp.status}`);
                const t = await resp.text();
                return { text: t, contentType: resp.headers.get('Content-Type') || '' };
            } catch (e) { errs.push('fetch+cred: ' + e.message); }

            // 尝试2: XHR
            try {
                return await xhrFetch(url);
            } catch (e) { errs.push('XHR: ' + e.message); }

            // 尝试3: GM_xmlhttpRequest
            try {
                const gmResp = await gmFetch(url, 'text');
                return { text: gmResp.responseText, contentType: '' };
            } catch (e) { errs.push('GM: ' + e.message); }

            throw new Error(errs.join(' | '));
        };

        // 最多重试3次，间隔递增
        let lastErr;
        for (let i = 0; i < 3; i++) {
            try {
                const result = await tryFetch(i + 1);
                let { text, contentType } = result;

                if (contentType && contentType.includes('text/html')) {
                    const doc = new DOMParser().parseFromString(text, 'text/html');
                    const dlLink = doc.querySelector('a[href*="aid="]') || doc.querySelector('a[download]');
                    if (dlLink && dlLink.href !== url) {
                        return fetchTxtContent(new URL(dlLink.getAttribute('href'), url).href);
                    }
                    const bodyText = doc.body?.innerText?.trim();
                    if (bodyText && bodyText.length < 100000) return bodyText;
                    if (text.includes('登录') || text.includes('login') || doc.querySelector('form[action*="login"]')) {
                        throw new Error('需要登录才能访问附件，请先在论坛登录');
                    }
                    return null;
                }
                return text;
            } catch (e) {
                lastErr = e.message;
                if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 1500));
            }
        }

        console.error('[fetchTxtContent] 重试3次均失败:', url, lastErr);
        throw new Error(`无法访问: ${url.substring(0, 80)}...`);
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
        const _tidMatch = url.match(/tid=(\d+)/);
        const tidKey = _tidMatch ? 'tid=' + _tidMatch[1] : '';
        const isTidHidden = tidKey ? (HIDDEN_TID_SET.has(tidKey) && !STATE.tempUnhiddenSet.has(tidKey)) : false;

        if (isKeywordBlocked || isUserBlocked || isTidHidden) {
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
            const url = link.href;
            const _tidMatch = url.match(/tid=(\d+)/);
            const tidKey = _tidMatch ? 'tid=' + _tidMatch[1] : '';
        const isTidHidden = tidKey ? (HIDDEN_TID_SET.has(tidKey) && !STATE.tempUnhiddenSet.has(tidKey)) : false;

            if (isKeywordBlocked || isUserBlocked || isTidHidden) {
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

    // 兼容 forumdisplay / guide / 其他列表页的不同容器
    const threadListContainer = (() => {
        // 优先匹配 forumdisplay 页的表格
        let c = document.querySelector('#threadlisttableid');
        if (c) return c;
        // guide 等页面：通过 tbody 定位容器
        const tbody = document.querySelector('tbody[id^="normalthread_"]');
        if (tbody) {
            // tbody 的父级 table/div（向上找最近的 table，找不到就用 tbody 的父级）
            c = tbody.closest('table') || tbody.parentNode;
            return c;
        }
        return null;
    })();
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

            // 自动全选并提取新加载的帖子（与启动时行为一致）
            if (STATE.autoExtractOnLoad && newThreads.length > 0) {
                setTimeout(() => {
                    // 只选可见帖子，然后触发提取（已提取的会被 extractSingleThread 自动跳过）
                    document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden) .custom-thread-checkbox').forEach(cb => {
                        cb.checked = true;
                    });
                    const checkedCbs = document.querySelectorAll('.custom-thread-checkbox:checked');
                    if (checkedCbs.length > 0) btnExtract.click();
                }, 300);
            }
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

    // ================= 一次性加载多页 =================
    const bulkLoadPages = async (pageCount) => {
        if (STATE.isLoadingNextPage) return;
        STATE.isLoadingNextPage = true;

        let nextUrl = document.querySelector('a.nxt')?.href;
        if (!nextUrl) {
            showToast('没有更多页面了', 'error');
            STATE.isLoadingNextPage = false;
            return 0;
        }

        let totalLoaded = 0;
        let totalSkipped = 0;
        let pagesLoaded = 0;

        const updateBtnProgress = (text) => {
            if (typeof btnBulkLoad !== 'undefined' && btnBulkLoad) {
                btnBulkLoad.innerText = text;
            }
        };

        // 从 URL 提取页码
        const extractPageNum = (url) => {
            try {
                const u = new URL(url, location.href);
                const p = u.searchParams.get('page');
                if (p) return parseInt(p);
                const m = u.pathname.match(/[-_](\d+)\.html?$/);
                if (m) return parseInt(m[1]);
            } catch(e) {}
            return null;
        };

        let firstPageNum = null;
        let lastPageNum = null;
        const pageCountNum = pageCount || STATE.bulkLoadPageCount;

        // 推断当前页码（用于分隔线"以上"标注）
        let currentPageNum = null;
        const firstNextPage = extractPageNum(nextUrl);
        if (firstNextPage !== null) {
            currentPageNum = firstNextPage - 1;
        } else {
            // 兜底：从当前页面 URL 提取
            currentPageNum = extractPageNum(location.href);
        }
        let prevPageNum = currentPageNum; // 上一页页码，初始为当前页

        for (let i = 0; i < pageCountNum; i++) {
            if (!nextUrl) break;

            updateBtnProgress('⏳ 加载中... (' + (i + 1) + '/' + pageCountNum + ')');

            // 从即将 fetch 的 URL 提取真实页码
            const pageNum = extractPageNum(nextUrl);
            if (pageNum !== null) {
                if (firstPageNum === null) firstPageNum = pageNum;
                lastPageNum = pageNum;
            }

            try {
                const res = await fetch(nextUrl);
                const text = await res.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');

                let skippedHidden = 0;
                let loadedThisPage = 0;
                const newThreads = doc.querySelectorAll('tbody[id^="normalthread_"]');

                newThreads.forEach(tbody => {
                    const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
                    if (link) {
                        const tidMatch = link.href.match(/tid=(\d+)/);
                        if (tidMatch && HIDDEN_TID_SET.has('tid=' + tidMatch[1])) {
                            skippedHidden++;
                            return;
                        }
                    }
                    threadListContainer.appendChild(tbody);
                    totalLoaded++;
                    loadedThisPage++;
                });
                totalSkipped += skippedHidden;
                pagesLoaded++;

                // 每页分隔线，"以上为第X页，以下为第Y页"
                const aboveNum = prevPageNum;
                const belowNum = pageNum;
                let sepLabel;
                if (aboveNum !== null && belowNum !== null) {
                    sepLabel = '以上为第 ' + aboveNum + ' 页，以下为第 ' + belowNum + ' 页';
                } else if (belowNum !== null) {
                    sepLabel = '以下为第 ' + belowNum + ' 页';
                } else {
                    sepLabel = '以下为第 ' + pagesLoaded + ' 页';
                }
                if (loadedThisPage === 0 && skippedHidden > 0) {
                    sepLabel += '（全部已隐藏）';
                }

                const sepTbody = document.createElement('tbody');
                sepTbody.className = 'custom-page-separator';
                const sepTr = document.createElement('tr');
                const sepTd = document.createElement('td');
                const headerRow = threadListContainer.querySelector('thead th, tbody:first-of-type tr:first-of-type td');
                const colCount = headerRow ? headerRow.parentElement.children.length : 5;
                sepTd.colSpan = colCount;
                sepTd.style.cssText = 'text-align:center; padding:8px 0; font-size:12px; color:#888; background:#f0f0f0; border-top:2px solid #e67e22; border-bottom:2px solid #e67e22;';
                sepTd.innerText = '── ' + sepLabel + ' ──';
                sepTr.appendChild(sepTd);
                sepTbody.appendChild(sepTr);
                threadListContainer.appendChild(sepTbody);

                // 更新上一页为当前页，供下一轮使用
                prevPageNum = pageNum;

                if (skippedHidden > 0) {
                    console.log(sepLabel + ' 跳过已隐藏帖子: ' + skippedHidden + ' 条');
                }

                const nextBtn = doc.querySelector('a.nxt');
                nextUrl = nextBtn ? nextBtn.href : null;
            } catch (e) {
                console.error('加载第' + (i + 1) + '页失败', e);
                showToast('加载第 ' + (i + 1) + ' 页失败', 'error');
                break;
            }
        }

        STATE.isLoadingNextPage = false;

        // 底部汇总分隔线
        if (pagesLoaded > 0) {
            const nextPageAfter = extractPageNum(nextUrl);
            let footerLabel;
            if (firstPageNum !== null && lastPageNum !== null) {
                if (firstPageNum === lastPageNum) {
                    footerLabel = '以上第 ' + firstPageNum + ' 页为本次加载内容';
                } else {
                    footerLabel = '以上第 ' + firstPageNum + ' - ' + lastPageNum + ' 页为本次加载内容';
                }
            } else {
                footerLabel = '以上 ' + pagesLoaded + ' 页为本次加载内容';
            }
            if (nextPageAfter !== null) {
                footerLabel += '，下一页是第 ' + nextPageAfter + ' 页';
            } else if (nextUrl) {
                footerLabel += '，还有更多页面';
            } else {
                footerLabel += '，已到最后一页';
            }

            const footerTbody = document.createElement('tbody');
            footerTbody.className = 'custom-page-separator custom-page-footer';
            const footerTr = document.createElement('tr');
            const footerTd = document.createElement('td');
            const headerRow = threadListContainer.querySelector('thead th, tbody:first-of-type tr:first-of-type td');
            const colCount = headerRow ? headerRow.parentElement.children.length : 5;
            footerTd.colSpan = colCount;
            footerTd.style.cssText = 'text-align:center; padding:10px 0; font-size:13px; font-weight:bold; color:#e67e22; background:#fff8f0; border-top:3px double #e67e22; border-bottom:3px double #e67e22;';
            footerTd.innerText = '══ ' + footerLabel + ' ══';
            footerTr.appendChild(footerTd);
            footerTbody.appendChild(footerTr);
            threadListContainer.appendChild(footerTbody);
        }

        if (totalLoaded > 0) {
            // 有可见帖子加载
            STATE.nextPageUrl = nextUrl;
            const skipMsg = totalSkipped > 0 ? '，跳过 ' + totalSkipped + ' 条已隐藏' : '';
            showToast('✅ ' + pagesLoaded + ' 页加载完毕，共 ' + totalLoaded + ' 条帖子' + skipMsg, 'success');
            updateBtnProgress('📄 一次性加载' + STATE.bulkLoadPageCount + '页（自动提取）');

            // 延迟等 DOM 处理完毕，自动全选并提取
            setTimeout(async () => {
                document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden) .custom-thread-checkbox').forEach(cb => {
                    cb.checked = true;
                });
                const checkedCbs = document.querySelectorAll('.custom-thread-checkbox:checked');
                if (checkedCbs.length > 0) {
                    btnExtract.click();
                    let waitCount = 0;
                    while (btnExtract.disabled && waitCount < 240) {
                        await new Promise(r => setTimeout(r, 500));
                        waitCount++;
                    }
                    showToast('✅ 提取完成', 'success');
                }
            }, 600);
        } else if (pagesLoaded > 0) {
            // 全部被隐藏，但仍尝试提取当前页可见帖子（兜底）
            showToast(totalSkipped > 0 ? '没有新帖子（全部 ' + totalSkipped + ' 条已隐藏）' : '没有加载到新帖子', 'info');
            updateBtnProgress('📄 一次性加载' + STATE.bulkLoadPageCount + '页（自动提取）');

            setTimeout(() => {
                const visibleCbs = document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden) .custom-thread-checkbox');
                if (visibleCbs.length > 0) {
                    visibleCbs.forEach(cb => { cb.checked = true; });
                    btnExtract.click();
                }
            }, 600);
        } else {
            showToast('没有更多页面了', 'error');
        }

        return totalLoaded;
    };

    // ================= 宽屏设置 =================
    const applyResetWidth = () => {
        if (STATE.resetWidth) {
            const px = STATE.resetWidthPx || 1500;
            // 尝试多种 Discuz! 常见容器选择器
            const selectors = ['.wp', '#nv', '#ct', '.ct2', '#wrap', '.wrap', '.container', '#append_parent'];
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el) el.style.width = px + 'px';
            });
            // 同时注入全局 CSS（兜底，强制覆盖）
            const styleId = 'custom-reset-width-style';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = `.wp,#nv,#ct,.ct2,#wrap,.wrap,.container{width:${px}px !important;margin:0 auto !important;}`;
        } else {
            // 移除 CSS
            const styleEl = document.getElementById('custom-reset-width-style');
            if (styleEl) styleEl.remove();
            // 清除 inline style
            const selectors = ['.wp', '#nv', '#ct', '.ct2', '#wrap', '.wrap', '.container', '#append_parent'];
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el) el.style.width = '';
            });
        }
    };
    applyResetWidth();

    // ================= UI 控制面板 =================
    const panel = document.createElement('div');
    panel.style.cssText = 'position: fixed; bottom: 50px; right: 50px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end;';

    // 面板位置应用函数
    const applyPanelPosition = (pos) => {
        // 重置之前可能的 transform
        panel.style.transform = '';
        switch (pos) {
            case 'center':
                panel.style.bottom = 'auto'; panel.style.right = 'auto';
                panel.style.top = '50%'; panel.style.left = '50%';
                panel.style.transform = 'translate(-50%, -50%)';
                panel.style.alignItems = 'center';
                break;
            case 'top-left':
                panel.style.bottom = 'auto'; panel.style.right = 'auto';
                panel.style.top = '50px'; panel.style.left = '50px';
                panel.style.alignItems = 'flex-start';
                break;
            case 'bottom-right':
            default:
                panel.style.top = 'auto'; panel.style.left = 'auto'; panel.style.transform = '';
                panel.style.bottom = '50px'; panel.style.right = '50px';
                panel.style.alignItems = 'flex-end';
                break;
        }
        STATE.panelPosition = pos;
        saveState('custom_panel_position', pos);
        // updateMinBtnPos 在脚本后面才定义，此处通过 setTimeout 延迟调用
        setTimeout(() => { if (typeof updateMinBtnPos === 'function') updateMinBtnPos(); }, 0);
    };
    // 应用已保存的面板位置
    applyPanelPosition(STATE.panelPosition);

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
        if (!STATE.autoLoadNextPage) {
            // 关闭时立即清理状态，截停正在进行的加载
            STATE.nextPageUrl = null;
            STATE.isLoadingNextPage = false;
            showToast('🔄 无缝翻页已关闭（立即生效）', 'info');
        } else {
            // 开启时重新获取下一页 URL（可能在浏览过程中页面已变化）
            const nxt = document.querySelector('a.nxt');
            STATE.nextPageUrl = nxt ? nxt.href : null;
            showToast('🔄 无缝翻页已开启，滚动到底部自动加载', 'success');
        }
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

    // 启动时面板默认状态
    const panelStartMinRow = document.createElement('div');
    panelStartMinRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const panelStartMinLabel = document.createElement('span');
    panelStartMinLabel.innerText = '📱 启动时默认折叠面板（显示小球）';
    panelStartMinLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const panelStartMinSwitch = document.createElement('input');
    panelStartMinSwitch.type = 'checkbox';
    panelStartMinSwitch.checked = STATE.panelStartMinimized;
    panelStartMinSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    panelStartMinSwitch.onchange = (e) => {
        STATE.panelStartMinimized = e.target.checked;
        saveState('custom_panel_start_minimized', STATE.panelStartMinimized);
    };
    panelStartMinRow.appendChild(panelStartMinLabel);
    panelStartMinRow.appendChild(panelStartMinSwitch);
    settingsPanel.appendChild(panelStartMinRow);

    // 面板位置设置
    const panelPosRow = document.createElement('div');
    panelPosRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const panelPosLabel = document.createElement('span');
    panelPosLabel.innerText = '📍 控制台面板位置';
    panelPosLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const panelPosSelect = document.createElement('select');
    panelPosSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [
        { value: 'bottom-right', label: '右下角' },
        { value: 'center', label: '居中显示' },
        { value: 'top-left', label: '左上角' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.innerText = opt.label;
        if (opt.value === STATE.panelPosition) o.selected = true;
        panelPosSelect.appendChild(o);
    });
    panelPosSelect.onchange = (e) => {
        applyPanelPosition(e.target.value);
        showToast('📍 面板位置已切换为：' + panelPosSelect.selectedOptions[0].innerText, 'info');
    };
    panelPosRow.appendChild(panelPosLabel);
    panelPosRow.appendChild(panelPosSelect);
    settingsPanel.appendChild(panelPosRow);

    // 控制台（Dashboard）位置设置
    const dbPosRow = document.createElement('div');
    dbPosRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const dbPosLabel = document.createElement('span');
    dbPosLabel.innerText = '🖥️ 控制台窗口位置';
    dbPosLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const dbPosSelect = document.createElement('select');
    dbPosSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [
        { value: 'center', label: '居中显示' },
        { value: 'bottom-right', label: '右下角' },
        { value: 'top-left', label: '左上角' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.innerText = opt.label;
        if (opt.value === STATE.dashboardPosition) o.selected = true;
        dbPosSelect.appendChild(o);
    });
    dbPosSelect.onchange = (e) => {
        STATE.dashboardPosition = e.target.value;
        saveState('custom_dashboard_position', e.target.value);
        // 清除旧的拖拽坐标，让预设位置生效
        STATE.dashboardX = null; STATE.dashboardY = null;
        saveState('custom_dashboard_x', null); saveState('custom_dashboard_y', null);
        // 如果控制台正在显示，关闭后下次打开即用新位置
        if (_dashboardDB && _dashboardDB.style.display === 'flex') {
            _dashboardDB.style.display = 'none';
            _dashboardDB.remove();
            _dashboardDB = null;
            _dashboardPanes = {};
        }
        showToast('🖥️ 控制台位置已切换为：' + dbPosSelect.selectedOptions[0].innerText + '（下次打开生效）', 'info');
    };
    dbPosRow.appendChild(dbPosLabel);
    dbPosRow.appendChild(dbPosSelect);
    settingsPanel.appendChild(dbPosRow);

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
        { val: '300px', label: '超大 (300px)' },
        { val: '500px', label: '特大 (500px)' },
        { val: '700px', label: '巨大 (700px)' },
        { val: '1000px', label: '原图级 (1000px)' }
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

    // 图片展示方式
    const imgDisplayModeRow = document.createElement('div');
    imgDisplayModeRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const imgDisplayModeLabel = document.createElement('span');
    imgDisplayModeLabel.innerText = '🖼️ 图片展示方式';
    imgDisplayModeLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const imgDisplayModeSelect = document.createElement('select');
    imgDisplayModeSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [
        { value: 'stack', label: '纵向排列' },
        { value: 'scroll', label: '横向滚动' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.innerText = opt.label;
        if (opt.value === STATE.imageDisplayMode) o.selected = true;
        imgDisplayModeSelect.appendChild(o);
    });
    imgDisplayModeSelect.onchange = (e) => {
        STATE.imageDisplayMode = e.target.value;
        saveState('custom_image_display_mode', STATE.imageDisplayMode);
        showToast('🖼️ 图片展示方式已切换，重新提取后生效', 'info');
    };
    imgDisplayModeRow.appendChild(imgDisplayModeLabel);
    imgDisplayModeRow.appendChild(imgDisplayModeSelect);
    settingsPanel.appendChild(imgDisplayModeRow);

    // 收藏/打开按钮样式
    const btnStyleRow = document.createElement('div');
    btnStyleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const btnStyleLabel = document.createElement('span');
    btnStyleLabel.innerText = '🔘 帖子操作按钮样式';
    btnStyleLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const btnStyleSelect = document.createElement('select');
    btnStyleSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [
        { value: 'rect', label: '矩形按钮（默认）' },
        { value: 'circle', label: '圆形大按钮' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value; o.innerText = opt.label;
        if (opt.value === STATE.buttonStyle) o.selected = true;
        btnStyleSelect.appendChild(o);
    });
    btnStyleSelect.onchange = (e) => {
        STATE.buttonStyle = e.target.value;
        saveState('custom_button_style', STATE.buttonStyle);
        showToast('🔘 按钮样式已切换，重新提取后生效', 'info');
    };
    btnStyleRow.appendChild(btnStyleLabel);
    btnStyleRow.appendChild(btnStyleSelect);
    settingsPanel.appendChild(btnStyleRow);

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

    // 宽屏设置
    const resetWidthRow = document.createElement('div');
    resetWidthRow.style.cssText = 'display: flex; align-items: center; gap: 6px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; flex-wrap: wrap;';
    const resetWidthLabel = document.createElement('span');
    resetWidthLabel.innerText = '🖥️ 宽屏宽度';
    resetWidthLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const resetWidthSwitch = document.createElement('input');
    resetWidthSwitch.type = 'checkbox';
    resetWidthSwitch.checked = STATE.resetWidth;
    resetWidthSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    const resetWidthInput = document.createElement('input');
    resetWidthInput.type = 'number';
    resetWidthInput.min = 500; resetWidthInput.max = 5000;
    resetWidthInput.value = STATE.resetWidthPx;
    resetWidthInput.style.cssText = 'width:70px; padding:2px 4px; font-size:12px; border:1px solid #ccc; border-radius:3px;';
    const resetWidthUnit = document.createElement('span');
    resetWidthUnit.innerText = 'px';
    resetWidthUnit.style.cssText = 'font-size:12px; color:#555;';
    resetWidthSwitch.onchange = (e) => {
        STATE.resetWidth = e.target.checked;
        saveState('custom_reset_width', STATE.resetWidth);
        applyResetWidth();
    };
    resetWidthInput.addEventListener('input', () => {
        const v = parseInt(resetWidthInput.value) || 1500;
        STATE.resetWidthPx = Math.max(500, Math.min(5000, v));
        saveState('custom_reset_width_px', STATE.resetWidthPx);
        applyResetWidth();
    });
    resetWidthRow.appendChild(resetWidthLabel);
    resetWidthRow.appendChild(resetWidthSwitch);
    resetWidthRow.appendChild(resetWidthInput);
    resetWidthRow.appendChild(resetWidthUnit);
    settingsPanel.appendChild(resetWidthRow);

    // 一次性加载页数设置
    const bulkLoadRow = document.createElement('div');
    bulkLoadRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const bulkLoadLabel = document.createElement('span');
    bulkLoadLabel.innerText = '📄 一次性加载页数';
    bulkLoadLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const bulkLoadSelect = document.createElement('select');
    bulkLoadSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [1, 2, 3, 4, 5].forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.innerText = n + ' 页';
        if (n === STATE.bulkLoadPageCount) opt.selected = true;
        bulkLoadSelect.appendChild(opt);
    });
    bulkLoadSelect.onchange = (e) => {
        STATE.bulkLoadPageCount = parseInt(e.target.value);
        saveState('custom_bulk_load_count', STATE.bulkLoadPageCount);
        // 更新按钮文字
        if (btnBulkLoad) {
            btnBulkLoad.innerText = '📄 一次性加载' + STATE.bulkLoadPageCount + '页（自动提取）';
        }
    };
    bulkLoadRow.appendChild(bulkLoadLabel);
    bulkLoadRow.appendChild(bulkLoadSelect);
    settingsPanel.appendChild(bulkLoadRow);

    // 页面加载时自动执行多页加载开关
    const autoBulkLoadRow = document.createElement('div');
    autoBulkLoadRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const autoBulkLoadLabel = document.createElement('span');
    autoBulkLoadLabel.innerText = '⚡ 页面加载时自动执行多页加载';
    autoBulkLoadLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const autoBulkLoadSwitch = document.createElement('input');
    autoBulkLoadSwitch.type = 'checkbox';
    autoBulkLoadSwitch.checked = STATE.autoBulkLoadOnPageLoad;
    autoBulkLoadSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    autoBulkLoadSwitch.onchange = (e) => {
        STATE.autoBulkLoadOnPageLoad = e.target.checked;
        saveState('custom_auto_bulk_load', STATE.autoBulkLoadOnPageLoad);
        showToast(e.target.checked ? '⚡ 页面加载时将自动执行多页加载' : '⚡ 已关闭自动多页加载', 'info');
    };
    autoBulkLoadRow.appendChild(autoBulkLoadLabel);
    autoBulkLoadRow.appendChild(autoBulkLoadSwitch);
    settingsPanel.appendChild(autoBulkLoadRow);

    // 隐藏帖子保留天数
    const hideTidsDaysRow = document.createElement('div');
    hideTidsDaysRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const hideTidsDaysLabel = document.createElement('span');
    hideTidsDaysLabel.innerText = '📅 隐藏记录保留天数';
    hideTidsDaysLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const hideTidsDaysSelect = document.createElement('select');
    hideTidsDaysSelect.style.cssText = 'cursor: pointer; font-size: 12px; padding: 2px;';
    [7, 14, 30, 60, 90, 180, 365, 0].forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.innerText = n === 0 ? '永久保留' : n + ' 天';
        if (n === STATE.hiddenTidsMaxDays) opt.selected = true;
        hideTidsDaysSelect.appendChild(opt);
    });
    hideTidsDaysSelect.onchange = (e) => {
        STATE.hiddenTidsMaxDays = parseInt(e.target.value);
        saveState('custom_hidden_tids_max_days', STATE.hiddenTidsMaxDays);
        if (STATE.hiddenTidsMaxDays === 0) return; // 永久保留不清除
        const maxAge = STATE.hiddenTidsMaxDays * 86400000;
        const now = Date.now();
        STATE.hiddenTids = STATE.hiddenTids.filter(entry => {
            if (now - entry[1] > maxAge) {
                HIDDEN_TID_SET.delete('tid=' + entry[0]);
                return false;
            }
            return true;
        });
        saveState('custom_hidden_tids', STATE.hiddenTids);
        reapplyFilters();
        showToast(`✅ 已清理过期记录（当前 ${STATE.hiddenTids.length} 条）`, 'success');
    };
    hideTidsDaysRow.appendChild(hideTidsDaysLabel);
    hideTidsDaysRow.appendChild(hideTidsDaysSelect);
    settingsPanel.appendChild(hideTidsDaysRow);

    // 隐藏记录管理（放在设置面板中，避免误触）
    const hiddenTidsManageWrap = document.createElement('div');
    hiddenTidsManageWrap.style.cssText = 'padding-bottom: 10px; border-bottom: 1px dashed #ccc;';

    const hiddenTidsTitle = document.createElement('div');
    hiddenTidsTitle.style.cssText = 'font-weight:bold; font-size:13px; margin-bottom:6px;';
    hiddenTidsTitle.innerText = `🗑️ 管理隐藏记录（当前 ${STATE.hiddenTids.length} 条）`;
    hiddenTidsManageWrap.appendChild(hiddenTidsTitle);

    const updateHiddenTidsTitle = () => {
        hiddenTidsTitle.innerText = `🗑️ 管理隐藏记录（当前 ${STATE.hiddenTids.length} 条）`;
    };

    // 辅助函数：清除指定条件的记录并刷新
    const clearHiddenTidsByFilter = (filterFn, desc) => {
        const before = STATE.hiddenTids.length;
        const removed = [];
        STATE.hiddenTids = STATE.hiddenTids.filter(entry => {
            if (filterFn(entry)) {
                HIDDEN_TID_SET.delete('tid=' + entry[0]);
                removed.push(entry);
                return false;
            }
            return true;
        });
        const after = STATE.hiddenTids.length;
        saveState('custom_hidden_tids', STATE.hiddenTids);
        document.querySelectorAll('tbody[id^="normalthread_"].custom-hidden').forEach(tbody => {
            tbody.classList.remove('custom-hidden');
        });
        reapplyFilters();
        updateHiddenTidsTitle();
        showToast(`✅ 已清除 ${before - after} 条记录（${desc}）`, 'success');
    };

    // 1. 清除 N 天前的记录
    const clearDaysRow = document.createElement('div');
    clearDaysRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 6px;';
    const clearDaysLabel = document.createElement('span');
    clearDaysLabel.innerText = '清除';
    clearDaysLabel.style.cssText = 'font-size:11px; color:#555; white-space:nowrap;';
    const clearDaysSelect = document.createElement('select');
    clearDaysSelect.style.cssText = 'cursor: pointer; font-size:11px; padding:2px; flex:1;';
    [1, 3, 7, 14, 30, 60, 90, 180, 365].forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        const labels = {1:'1 天', 7:'7 天 (一周)', 14:'14 天', 30:'30 天 (一个月)', 60:'60 天', 90:'90 天 (三个月)', 180:'180 天 (半年)', 365:'365 天 (一年)'};
        opt.innerText = labels[n] || n + ' 天';
        if (n === 30) opt.selected = true;
        clearDaysSelect.appendChild(opt);
    });
    const clearDaysLabel2 = document.createElement('span');
    clearDaysLabel2.innerText = '前的记录';
    clearDaysLabel2.style.cssText = 'font-size:11px; color:#555; white-space:nowrap;';
    const clearDaysBtn = document.createElement('button');
    clearDaysBtn.type = 'button';
    clearDaysBtn.innerText = '执行';
    clearDaysBtn.style.cssText = 'padding:2px 10px; font-size:11px; cursor:pointer; background:#dc3545; color:#fff; border:none; border-radius:3px; font-weight:bold; white-space:nowrap;';
    clearDaysBtn.onclick = () => {
        const days = parseInt(clearDaysSelect.value);
        const cutoff = Date.now() - days * 86400000;
        clearHiddenTidsByFilter(entry => entry[1] < cutoff, `${days} 天前`);
    };
    clearDaysRow.appendChild(clearDaysLabel);
    clearDaysRow.appendChild(clearDaysSelect);
    clearDaysRow.appendChild(clearDaysLabel2);
    clearDaysRow.appendChild(clearDaysBtn);
    hiddenTidsManageWrap.appendChild(clearDaysRow);

    // 2. 清除指定日期之前的记录
    const clearDateRow = document.createElement('div');
    clearDateRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 6px;';
    const clearDateLabel = document.createElement('span');
    clearDateLabel.innerText = '清除';
    clearDateLabel.style.cssText = 'font-size:11px; color:#555; white-space:nowrap;';
    const clearDateInput = document.createElement('input');
    clearDateInput.type = 'date';
    clearDateInput.style.cssText = 'flex:1; padding:2px 4px; font-size:11px; border:1px solid #ccc; border-radius:3px;';
    const clearDateLabel2 = document.createElement('span');
    clearDateLabel2.innerText = '前的记录';
    clearDateLabel2.style.cssText = 'font-size:11px; color:#555; white-space:nowrap;';
    const clearDateBtn = document.createElement('button');
    clearDateBtn.type = 'button';
    clearDateBtn.innerText = '执行';
    clearDateBtn.style.cssText = 'padding:2px 10px; font-size:11px; cursor:pointer; background:#dc3545; color:#fff; border:none; border-radius:3px; font-weight:bold; white-space:nowrap;';
    clearDateBtn.onclick = () => {
        const dateVal = clearDateInput.value;
        if (!dateVal) { showToast('请先选择日期', 'error'); return; }
        const cutoff = new Date(dateVal + 'T00:00:00').getTime();
        clearHiddenTidsByFilter(entry => entry[1] < cutoff, `${dateVal} 之前`);
    };
    clearDateRow.appendChild(clearDateLabel);
    clearDateRow.appendChild(clearDateInput);
    clearDateRow.appendChild(clearDateLabel2);
    clearDateRow.appendChild(clearDateBtn);
    hiddenTidsManageWrap.appendChild(clearDateRow);

    // 3. 清除全部记录（需二次确认）
    const clearAllRow = document.createElement('div');
    clearAllRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.innerText = '⚠️ 清空全部隐藏记录';
    clearAllBtn.style.cssText = 'padding:3px 8px; font-size:11px; cursor:pointer; background:#dc3545; color:#fff; border:1px solid #b02a37; border-radius:3px; font-weight:bold; width:100%;';
    clearAllBtn.onclick = () => {
        if (!confirm(`确定清空全部 ${STATE.hiddenTids.length} 条隐藏记录？此操作不可撤销。\n\n（清除前会自动备份到本地）`)) return;
        if (!confirm(`再次确认：确定清空全部 ${STATE.hiddenTids.length} 条隐藏记录？`)) return;
        // 清除前自动备份
        if (STATE.hiddenTids.length > 0) {
            try {
                const data = {
                    version: 1, exportedAt: new Date().toISOString(),
                    count: STATE.hiddenTids.length, records: STATE.hiddenTids
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `hidden-tids-backup-before-clear-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch(e) {}
        }
        clearHiddenTidsByFilter(() => true, '全部');
    };
    clearAllRow.appendChild(clearAllBtn);
    hiddenTidsManageWrap.appendChild(clearAllRow);

    // 4. 备份 / 还原隐藏记录
    const backupRestoreRow = document.createElement('div');
    backupRestoreRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-top: 6px;';

    const backupBtn = document.createElement('button');
    backupBtn.type = 'button';
    backupBtn.innerText = '💾 备份';
    backupBtn.title = '将隐藏记录导出为 JSON 文件保存到本地';
    backupBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#17a2b8; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    backupBtn.onclick = () => {
        if (STATE.hiddenTids.length === 0) { showToast('没有可备份的记录', 'error'); return; }
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            count: STATE.hiddenTids.length,
            records: STATE.hiddenTids
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().slice(0, 10);
        a.download = `hidden-tids-backup-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`💾 已备份 ${STATE.hiddenTids.length} 条记录`, 'success');
    };
    backupRestoreRow.appendChild(backupBtn);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.innerText = '📥 还原';
    restoreBtn.title = '从本地 JSON 备份文件还原隐藏记录（会合并到现有记录）';
    restoreBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#6f42c1; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    restoreBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data.records || !Array.isArray(data.records)) {
                        showToast('备份文件格式无效', 'error');
                        return;
                    }
                    const count = data.count || data.records.length;
                    if (!confirm(`即将从备份还原 ${count} 条记录（合并到现有 ${STATE.hiddenTids.length} 条），确定继续？`)) return;

                    let added = 0;
                    const now = Date.now();
                    for (const entry of data.records) {
                        const tid = Array.isArray(entry) ? entry[0] : entry;
                        const ts = (Array.isArray(entry) && entry[1]) ? entry[1] : now;
                        const key = 'tid=' + tid;
                        if (!HIDDEN_TID_SET.has(key)) {
                            HIDDEN_TID_SET.add(key);
                            STATE.hiddenTids.push([tid, ts]);
                            added++;
                        }
                    }
                    saveState('custom_hidden_tids', STATE.hiddenTids);
                    updateHiddenTidsTitle();
                    reapplyFilters();
                    showToast(`📥 已还原 ${added} 条记录（跳过 ${count - added} 条重复）`, 'success');
                } catch (err) {
                    showToast(`还原失败: ${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
            input.remove();
        };
        document.body.appendChild(input);
        input.click();
    };
    backupRestoreRow.appendChild(restoreBtn);
    hiddenTidsManageWrap.appendChild(backupRestoreRow);

    settingsPanel.appendChild(hiddenTidsManageWrap);

    // ================= GitHub Gist 云备份设置 =================
    const gistBackupWrap = document.createElement('div');
    gistBackupWrap.style.cssText = 'padding-bottom: 10px; border-bottom: 1px dashed #ccc;';

    const gistTitle = document.createElement('div');
    gistTitle.style.cssText = 'font-weight:bold; font-size:13px; margin-bottom:4px;';
    gistTitle.innerText = '☁️ GitHub Gist 云备份';
    gistBackupWrap.appendChild(gistTitle);

    const gistNote = document.createElement('div');
    gistNote.style.cssText = 'font-size:10px; color:#888; margin-bottom:4px;';
    gistNote.innerText = 'GitHub Token 获取: https://github.com/settings/tokens → Generate new token (classic) → 勾选 gist → 生成后粘贴到上方';
    gistBackupWrap.appendChild(gistNote);

    // Token 输入
    const gistTokenRow = document.createElement('div');
    gistTokenRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';
    const gistTokenInput = document.createElement('input');
    gistTokenInput.type = 'password';
    gistTokenInput.value = STATE.gistToken;
    gistTokenInput.placeholder = 'GitHub Personal Access Token';
    gistTokenInput.style.cssText = 'flex:1; padding:3px 5px; font-size:11px; border:1px solid #ccc; border-radius:3px;';
    let _lastSavedToken = STATE.gistToken;
    gistTokenInput.addEventListener('input', () => {
        STATE.gistToken = gistTokenInput.value.trim();
        saveState('custom_gist_token', STATE.gistToken);
    });
    gistTokenInput.addEventListener('blur', () => {
        // Token 变化时清除旧 gist ID，下次备份会创建新 gist
        if (STATE.gistToken && STATE.gistToken !== _lastSavedToken) {
            _lastSavedToken = STATE.gistToken;
            if (STATE.gistId) {
                STATE.gistId = '';
                saveState('custom_gist_id', '');
            }
        }
    });
    gistTokenRow.appendChild(gistTokenInput);
    const gistTestBtn = document.createElement('button');
    gistTestBtn.type = 'button';
    gistTestBtn.innerText = '测试';
    gistTestBtn.style.cssText = 'padding:2px 6px; font-size:10px; cursor:pointer; background:#17a2b8; color:#fff; border:none; border-radius:3px; white-space:nowrap;';
    gistTestBtn.onclick = () => gistTestToken();
    gistTokenRow.appendChild(gistTestBtn);
    gistBackupWrap.appendChild(gistTokenRow);

    // Gist ID 输入（跨设备还原时手动填入）
    const gistIdRow = document.createElement('div');
    gistIdRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';
    const gistIdInput = document.createElement('input');
    gistIdInput.type = 'text';
    gistIdInput.value = STATE.gistId;
    gistIdInput.placeholder = 'Gist ID（留空自动创建，跨设备还原时填入）';
    gistIdInput.style.cssText = 'flex:1; padding:3px 5px; font-size:11px; border:1px solid #ccc; border-radius:3px; font-family:monospace;';
    gistIdInput.addEventListener('input', () => {
        STATE.gistId = gistIdInput.value.trim();
        saveState('custom_gist_id', STATE.gistId);
    });
    gistIdRow.appendChild(gistIdInput);
    const gistIdSearchBtn = document.createElement('button');
    gistIdSearchBtn.type = 'button';
    gistIdSearchBtn.innerText = '🔍';
    gistIdSearchBtn.title = '搜索已有备份 Gist（根据 Token 自动查找）';
    gistIdSearchBtn.style.cssText = 'padding:2px 6px; font-size:10px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:3px; white-space:nowrap;';
    gistIdSearchBtn.onclick = async () => {
        if (!STATE.gistToken) { showToast('请先设置 Token', 'error'); return; }
        gistIdSearchBtn.disabled = true;
        gistIdSearchBtn.innerText = '⏳';
        try {
            // 尝试查找包含 hidden-tids.json 或 bookmarks.json 的 Gist
            let foundId = await gistFindByFilename('hidden-tids.json');
            if (!foundId) foundId = await gistFindByFilename('bookmarks.json');
            if (foundId) {
                STATE.gistId = foundId;
                saveState('custom_gist_id', foundId);
                gistIdInput.value = foundId;
                showPersistentToast('✅ 找到备份 Gist: ' + foundId.slice(0, 10) + '...\n完整 ID: ' + foundId, 'success');
            } else {
                showPersistentToast('未找到已有备份 Gist，请先在此设备执行一次备份', 'info');
            }
        } catch (e) {
            showPersistentToast('搜索失败: ' + e.message, 'error');
        }
        gistIdSearchBtn.disabled = false;
        gistIdSearchBtn.innerText = '🔍';
    };
    gistIdRow.appendChild(gistIdSearchBtn);
    gistBackupWrap.appendChild(gistIdRow);

    // 自动备份开关
    const gistAutoRow = document.createElement('div');
    gistAutoRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;';
    const gistAutoLabel = document.createElement('span');
    gistAutoLabel.innerText = '新增隐藏时自动备份到 Gist';
    gistAutoLabel.style.cssText = 'font-size: 11px; color: #555;';
    const gistAutoSwitch = document.createElement('input');
    gistAutoSwitch.type = 'checkbox';
    gistAutoSwitch.checked = STATE.gistBackupEnabled;
    gistAutoSwitch.style.cssText = 'cursor: pointer; width: 14px; height: 14px;';
    gistAutoSwitch.onchange = (e) => {
        STATE.gistBackupEnabled = e.target.checked;
        saveState('custom_gist_backup_enabled', STATE.gistBackupEnabled);
    };
    gistAutoRow.appendChild(gistAutoLabel);
    gistAutoRow.appendChild(gistAutoSwitch);
    gistBackupWrap.appendChild(gistAutoRow);

    // 手动备份按钮 - 第一行
    const gistBtnRow1 = document.createElement('div');
    gistBtnRow1.style.cssText = 'display: flex; gap: 4px; margin-bottom: 4px;';
    const gistBackupBtn = document.createElement('button');
    gistBackupBtn.type = 'button';
    gistBackupBtn.innerText = '☁️ 备份记录';
    gistBackupBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    gistBackupBtn.onclick = () => gistBackup();
    gistBtnRow1.appendChild(gistBackupBtn);

    const gistRestoreBtn = document.createElement('button');
    gistRestoreBtn.type = 'button';
    gistRestoreBtn.innerText = '📥 还原记录';
    gistRestoreBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#6f42c1; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    gistRestoreBtn.onclick = () => gistRestore();
    gistBtnRow1.appendChild(gistRestoreBtn);
    gistBackupWrap.appendChild(gistBtnRow1);

    // 第二行 - 设置备份/还原
    const gistBtnRow2 = document.createElement('div');
    gistBtnRow2.style.cssText = 'display: flex; gap: 4px;';
    const gistBackupSettingsBtn = document.createElement('button');
    gistBackupSettingsBtn.type = 'button';
    gistBackupSettingsBtn.innerText = '⚙️ 备份设置';
    gistBackupSettingsBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#17a2b8; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    gistBackupSettingsBtn.onclick = () => gistBackupSettings();
    gistBtnRow2.appendChild(gistBackupSettingsBtn);

    const gistRestoreSettingsBtn = document.createElement('button');
    gistRestoreSettingsBtn.type = 'button';
    gistRestoreSettingsBtn.innerText = '📥 还原设置';
    gistRestoreSettingsBtn.style.cssText = 'flex:1; padding:3px 6px; font-size:11px; cursor:pointer; background:#6f42c1; color:#fff; border:none; border-radius:3px; font-weight:bold;';
    gistRestoreSettingsBtn.onclick = () => gistRestoreSettings();
    gistBtnRow2.appendChild(gistRestoreSettingsBtn);
    gistBackupWrap.appendChild(gistBtnRow2);

    settingsPanel.appendChild(gistBackupWrap);

    // 永久隐藏帖子按钮（放在 btnGroup 主面板，不在设置里）

    // TODO: 以下设置项对应的功能暂未启用，隐藏
    renameRulesWrap.style.display = 'none';

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

    // 滚动小球开关
    const scrollBallToggleRow = document.createElement('div');
    scrollBallToggleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    const scrollBallToggleLabel = document.createElement('span');
    scrollBallToggleLabel.innerText = '🔽 显示滚动小球';
    scrollBallToggleLabel.style.cssText = 'font-size: 13px; font-weight: bold; color: #333;';
    const scrollBallToggleSwitch = document.createElement('input');
    scrollBallToggleSwitch.type = 'checkbox';
    scrollBallToggleSwitch.checked = STATE.scrollBallEnabled;
    scrollBallToggleSwitch.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
    scrollBallToggleSwitch.onchange = (e) => {
        STATE.scrollBallEnabled = e.target.checked;
        saveState('custom_scroll_ball_enabled', STATE.scrollBallEnabled);
        if (SCROLL_BALL) {
            SCROLL_BALL.style.display = e.target.checked ? 'flex' : 'none';
        }
        showToast(e.target.checked ? '🔽 滚动小球已显示' : '🔽 滚动小球已隐藏', 'info');
    };
    scrollBallToggleRow.appendChild(scrollBallToggleLabel);
    scrollBallToggleRow.appendChild(scrollBallToggleSwitch);
    settingsPanel.appendChild(scrollBallToggleRow);

    // 滚动小球速度设置
    const scrollBallRow = document.createElement('div');
    scrollBallRow.style.cssText = 'padding-bottom: 10px; border-bottom: 1px dashed #ccc;';
    scrollBallRow.innerHTML = '<div style="font-weight:bold; font-size:13px; margin-bottom:6px;">🔽 滚动小球速度设置</div>';
    const makeSpeedRow = (label, key, defVal, opts) => {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11px; color:#555;';
        lbl.innerText = label;
        r.appendChild(lbl);
        const sel = document.createElement('select');
        sel.style.cssText = 'cursor:pointer; font-size:11px; padding:2px;';
        opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.innerText = o + ' px/s'; if (STATE[key] === o) opt.selected = true; sel.appendChild(opt); });
        sel.onchange = (e) => { STATE[key] = parseInt(e.target.value); saveState(key, STATE[key]); };
        r.appendChild(sel);
        return r;
    };
    scrollBallRow.appendChild(makeSpeedRow('点击速度 1x', 'scrollSpeed1', 80, [40, 60, 80, 100, 120, 160, 200]));
    scrollBallRow.appendChild(makeSpeedRow('点击速度 2x', 'scrollSpeed2', 200, [120, 160, 200, 250, 300, 400, 500]));
    scrollBallRow.appendChild(makeSpeedRow('点击速度 3x', 'scrollSpeed3', 400, [250, 300, 400, 500, 600, 800, 1000]));
    scrollBallRow.appendChild(makeSpeedRow('拖拽最大速度', 'scrollMaxSpeed', 600, [300, 400, 500, 600, 800, 1000, 1500]));
    scrollBallRow.appendChild(makeSpeedRow('拖拽灵敏度', 'scrollSensitivity', 2, [1, 2, 3, 4, 5, 7, 10]));
    settingsPanel.appendChild(scrollBallRow);

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
    btnToggleSet.onclick = () => showDashboard('settings');

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
        box.style.cssText = 'margin-top:10px; padding-left:25px; display:flex; flex-direction:column; gap:8px; max-width:100%; overflow:hidden; box-sizing:border-box;';

        // ---- 图片 ----
        if (data.images.length > 0) {
            const imgWrap = document.createElement('div');
            if (STATE.imageDisplayMode === 'scroll') {
                // 横向滚动模式
                imgWrap.style.cssText = 'overflow-x:auto; white-space:nowrap; padding:4px 0; -webkit-overflow-scrolling:touch;';
                data.images.forEach((src, i) => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.dataset.idx = i;
                    img.style.cssText = `max-height:${STATE.imageSize}; max-width:100%; object-fit:cover; border-radius:4px; margin-right:6px; cursor:pointer; display:inline-block; vertical-align:top;`;
                    imgWrap.appendChild(img);
                });
            } else {
                // 默认纵向堆叠模式
                imgWrap.innerHTML = data.images.map((src, i) => `<img src="${src}" data-idx="${i}" style="max-height:${STATE.imageSize}; max-width:100%; object-fit:cover; border-radius:4px; margin-right:5px; cursor:pointer;">`).join('');
            }
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

        // ---- 收藏按钮（列表页提取区，位于图片下方、链接上方） ----
        (() => {
            const _bmTid = (threadUrl.match(/tid=(\d+)/) || [])[1];
            if (_bmTid) {
                const _bmTitle = (() => {
                    const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
                    return link ? link.innerText.trim() : threadUrl;
                })();
                const bmRow = document.createElement('div');
                const isCircle = STATE.buttonStyle === 'circle';
                bmRow.style.cssText = isCircle
                    ? 'display:flex; gap:10px; margin-top:8px; max-width:100%; justify-content:center;'
                    : 'display:flex; gap:6px; margin-top:8px; max-width:100%; min-width:0;';
                const _mkBmBtn = (type, label, bgColor, icon) => {
                    const _curType = getBookmarkType(_bmTid);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    if (isCircle) {
                        btn.innerHTML = `<span style="font-size:28px; line-height:1;">${icon}</span>`;
                        btn.title = label;
                        btn.style.cssText = `width:64px; height:64px; cursor:pointer; background:${bgColor}; color:#fff; border:none; border-radius:50%; font-weight:bold; opacity:${_curType === type ? '1' : '0.45'}; transition:all 0.15s; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 3px 10px rgba(0,0,0,0.2);`;
                    } else {
                        btn.innerText = label;
                        btn.style.cssText = `flex:1; padding:12px 10px; font-size:14px; cursor:pointer; background:${bgColor}; color:#fff; border:none; border-radius:4px; font-weight:bold; opacity:${_curType === type ? '1' : '0.55'}; transition:opacity 0.15s; white-space:normal; word-break:keep-all; overflow:hidden; text-overflow:ellipsis; min-width:0;`;
                    }
                    btn.onmouseover = () => { btn.style.opacity = '1'; btn.style.transform = isCircle ? 'scale(1.1)' : ''; };
                    btn.onmouseout = () => { if (getBookmarkType(_bmTid) !== type) btn.style.opacity = isCircle ? '0.45' : '0.55'; btn.style.transform = ''; };
                    btn.onclick = (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        if (isBookmarked(_bmTid) && getBookmarkType(_bmTid) === type) {
                            removeBookmark(_bmTid);
                            showToast('已取消收藏', 'info');
                            bmRow.querySelectorAll('button').forEach(b => {
                                const bmType = b.dataset.bmType;
                                if (bmType) b.style.opacity = isCircle ? '0.45' : '0.55';
                            });
                        } else {
                            const result = addBookmark(_bmTid, _bmTitle, threadUrl, type);
                            showToast(result === 'updated' ? `已更新收藏为${type === 'important' ? '重要' : '一般'}` : `已收藏为${type === 'important' ? '重要⭐' : '一般📌'}`, 'success');
                            bmRow.querySelectorAll('button').forEach(b => {
                                const bmType = b.dataset.bmType;
                                if (bmType) b.style.opacity = bmType === type ? '1' : (isCircle ? '0.45' : '0.55');
                            });
                        }
                        updateListBmBtns();
                    };
                    btn.dataset.bmType = type;
                    return btn;
                };
                bmRow.appendChild(_mkBmBtn('important', '收藏为重要帖子', '#dc3545', '⭐'));
                bmRow.appendChild(_mkBmBtn('normal', '收藏为一般帖子', '#007bff', '📌'));
                const openThreadBtn = document.createElement('button');
                openThreadBtn.type = 'button';
                if (isCircle) {
                    openThreadBtn.innerHTML = '<span style="font-size:28px; line-height:1;">📂</span>';
                    openThreadBtn.title = '打开帖子';
                    openThreadBtn.style.cssText = 'width:64px; height:64px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:50%; font-weight:bold; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 3px 10px rgba(0,0,0,0.2); transition:transform 0.15s;';
                    openThreadBtn.onmouseover = () => { openThreadBtn.style.transform = 'scale(1.1)'; };
                    openThreadBtn.onmouseout = () => { openThreadBtn.style.transform = ''; };
                } else {
                    openThreadBtn.innerText = '📂 打开帖子';
                    openThreadBtn.style.cssText = 'flex:1; padding:12px 10px; font-size:14px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:4px; font-weight:bold; white-space:normal; word-break:keep-all; overflow:hidden; text-overflow:ellipsis; min-width:0;';
                }
                openThreadBtn.onclick = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    GM_openInTab(threadUrl, { active: false, insert: true });
                    showToast('📂 已在新标签页打开帖子', 'success');
                };
                bmRow.appendChild(openThreadBtn);
                box.appendChild(bmRow);
            }
        })();

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
                linkCopyBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 12px; background:#6c757d; color:#fff; border:none; border-radius:3px; font-weight:bold;';
                linkCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(linkContent).then(() => { linkCopyBtn.innerText = '已复制'; setTimeout(() => linkCopyBtn.innerText = '复制全部', 2000); }); };
                linkBtnRow.appendChild(linkCopyBtn);

                const pushAllBtn = document.createElement('button');
                pushAllBtn.type = 'button'; pushAllBtn.innerText = '☁️ 一键推送全部';
                pushAllBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 24px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
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
                    lineCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px; flex-shrink:0; font-weight:bold;';
                    lineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(link).then(() => { lineCopyBtn.innerText = '已复制'; setTimeout(() => lineCopyBtn.innerText = '复制', 1500); }); };
                    lineDiv.appendChild(lineCopyBtn);

                    const linePushBtn = document.createElement('button');
                    linePushBtn.type = 'button'; linePushBtn.innerText = '☁️';
                     linePushBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:2px 16px; background:#fd7e14; color:#fff; border:none; border-radius:3px; flex-shrink:0; font-weight:bold;';
                    linePushBtn.title = '推送到115';
                    linePushBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); pushLinksTo115([link], linePushBtn); };
                    lineDiv.appendChild(linePushBtn);

                    linkListDiv.appendChild(lineDiv);
                });
                linkWrap.appendChild(linkListDiv);

                if (everyLink.length > 10) {
                    const linkToggle = document.createElement('button');
                    linkToggle.type = 'button'; linkToggle.innerText = '展开全文';
                    linkToggle.style.cssText = 'font-size:12px; margin-top:4px; cursor:pointer; padding:4px 12px; background:#e9ecef; border:1px solid #ccc; border-radius:3px; font-weight:bold;';
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
                copyBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 12px; background:#6c757d; color:#fff; border:none; border-radius:3px; font-weight:bold;';
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
                    toggleBtn.style.cssText = 'font-size:12px; margin-top:4px; cursor:pointer; padding:4px 12px; background:#e9ecef; border:1px solid #ccc; border-radius:3px; font-weight:bold;';
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

    // ================= GitHub Gist 云备份 =================
    const gistApi = (method, path, body) => new Promise((resolve, reject) => {
        if (!STATE.gistToken) { reject(new Error('请先设置 GitHub Token')); return; }
        const opts = {
            method, url: 'https://api.github.com' + path,
            headers: {
                'Authorization': 'Bearer ' + STATE.gistToken,
                'Accept': 'application/vnd.github+json'
            },
            timeout: 60000,
            onload: (r) => {
                console.log('[gistApi] ' + method + ' ' + path + ' -> HTTP ' + r.status + ' (' + (r.responseText ? r.responseText.length : 0) + ' bytes)');
                if (r.status >= 200 && r.status < 300) {
                    try { resolve(JSON.parse(r.responseText)); } catch(e) { resolve(r.responseText); }
                } else if (r.status === 401) {
                    reject(new Error('Token 无效或已过期'));
                } else if (r.status === 404) {
                    reject(new Error('Gist 不存在或已被删除'));
                } else if (r.status === 403) {
                    reject(new Error('API 限流，请稍后再试'));
                } else {
                    try {
                        const err = JSON.parse(r.responseText);
                        reject(new Error(err.message || 'HTTP ' + r.status));
                    } catch(e) {
                        // responseText 可能是 HTML，提取有意义的部分
                        const raw = r.responseText || '';
                        // 先尝试从 HTML 中提取 title
                        const titleMatch = raw.match(/<title>([^<]+)<\/title>/);
                        const clean = titleMatch ? titleMatch[1] : raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
                        reject(new Error('HTTP ' + r.status + (clean ? ': ' + clean : ' (请求格式可能有误，body=' + (opts.data ? opts.data.length : 0) + ' bytes)')));
                    }
                }
            },
            onerror: (err) => { console.error('[gistApi] 网络错误:', method, path, err); reject(new Error('网络错误，请检查网络连接')); },
            ontimeout: () => { console.error('[gistApi] 超时:', method, path); reject(new Error('请求超时（60s），请检查网络或尝试刷新页面后重试')); }
        };
        if (body) {
            opts.data = JSON.stringify(body);
            // 必须手动设置 Content-Type: application/json，否则 TM 会默认 application/x-www-form-urlencoded
            opts.headers['Content-Type'] = 'application/json; charset=utf-8';
        }
        console.log('[gistApi] 发送', method, path, body ? '(' + JSON.stringify(body).length + ' bytes body)' : '');
        GM_xmlhttpRequest(opts);
    });

    // 辅助：搜索用户的 Gist 列表，找到包含指定文件名的 Gist ID
    const gistFindByFilename = async (filename) => {
        let page = 1;
        while (page <= 5) { // 最多搜索5页
            const gists = await gistApi('GET', `/gists?per_page=100&page=${page}`);
            if (!Array.isArray(gists) || gists.length === 0) break;
            for (const g of gists) {
                if (g.files && g.files[filename]) return g.id;
            }
            if (gists.length < 100) break;
            page++;
        }
        return null;
    };

    // 统一 Gist 更新：构建所有文件并从本地状态一次 PATCH，无需预先 GET
    // fileNames: 可选，指定本次要更新的文件名列表（PATCH 时只更新这些文件，避免覆盖无关数据）
    //            不传或传空数组则更新全部文件；POST 创建时始终包含全部文件
    const gistSyncAll = async (label, silent, fileNames) => {
        // 1) 构建所有文件内容（注意：大数组不放入 script-settings.json，避免超 1MB 限制）
        const buildAllFiles = () => {
            const files = {};
            // hidden-tids.json
            const htData = { version: 1, exportedAt: new Date().toISOString(), count: STATE.hiddenTids.length, records: STATE.hiddenTids };
            files['hidden-tids.json'] = { content: JSON.stringify(htData) };
            // bookmarks.json
            const bmData = { version: 1, exportedAt: new Date().toISOString(), count: STATE.bookmarks.length, records: STATE.bookmarks };
            files['bookmarks.json'] = { content: JSON.stringify(bmData) };
            // script-settings.json（排除大数组，它们已在各自文件中）
            const settings = {};
            const _largeKeys = ['threadCache', 'isLoadingNextPage', 'nextPageUrl', 'panelMinimized',
                'gistToken', 'gistId', 'bookmarks', 'bookmarksGistBackupEnabled', 'bookmarksPanelActiveTab',
                'hiddenTids', 'blocked', 'blockedUsers', 'highlighted', 'readLinks',
                'offline115Favorites', 'offline115RenameRules'];
            for (const [k, v] of Object.entries(STATE)) {
                if (_largeKeys.includes(k)) continue;
                settings[k] = v;
            }
            const ssData = { version: 1, exportedAt: new Date().toISOString(), settings };
            files['script-settings.json'] = { content: JSON.stringify(ssData) };
            return files;
        };

        const ts = new Date().toISOString().slice(0, 19);
        const allFiles = buildAllFiles();

        if (STATE.gistId) {
            // PATCH 时只更新指定的文件，防止覆盖其他类型的云数据
            // 例如：收藏夹备份只更新 bookmarks.json，不影响 hidden-tids.json
            const patchFiles = (fileNames && fileNames.length > 0)
                ? Object.fromEntries(Object.entries(allFiles).filter(([k]) => fileNames.includes(k)))
                : allFiles;

            // 尝试直接 PATCH 更新（一次请求，无需预先 GET）
            const t = label ? showPersistentToast('☁️ 正在更新 Gist (' + STATE.gistId.slice(0, 8) + ')...', 'info') : null;
            try {
                await gistApi('PATCH', '/gists/' + STATE.gistId, {
                    description: '论坛脚本备份（更新于 ' + ts + '）',
                    files: patchFiles
                });
                if (t) { t.querySelector('.pt-msg').textContent = label; t.style.background = '#52c41a'; }
                return;
            } catch (patchErr) {
                console.warn('[gistSyncAll] PATCH 失败:', patchErr.message);
                const isDeleted = patchErr.message.includes('不存在') || patchErr.message.includes('404');
                if (isDeleted) {
                    STATE.gistId = '';
                    saveState('custom_gist_id', '');
                    if (t) t.querySelector('.pt-msg').textContent = '⚠️ Gist 已被删除，正在重建...';
                } else {
                    // 超时等网络问题 → 直接报错，不创建新 Gist（避免重复）
                    if (t) { t.querySelector('.pt-msg').textContent = '❌ 更新超时：' + patchErr.message; t.style.background = '#dc3545'; }
                    throw patchErr;
                }
            }
        }

        // 2) 无 gistId 或已被删除 → 创建新 Gist（始终包含全部文件）
        try {
            const result = await gistApi('POST', '/gists', {
                description: '论坛脚本备份',
                public: false,
                files: allFiles
            });
            STATE.gistId = result.id;
            saveState('custom_gist_id', STATE.gistId);
            if (!silent) showPersistentToast('✅ ☁️ 已创建 Gist（' + STATE.gistId.slice(0, 8) + '...）' + (label ? ' — ' + label : ''), 'success');
        } catch (createErr) {
            throw new Error('创建 Gist 失败: ' + createErr.message);
        }
    };

    // 备份到 Gist（隐藏记录）
    const gistBackup = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先在设置中填写 GitHub Token', 'error'); return; }
        try {
            await gistSyncAll('✅ ☁️ 已更新 Gist（' + STATE.hiddenTids.length + ' 条记录）', false, ['hidden-tids.json']);
        } catch (e) {
            showPersistentToast('❌ ☁️ Gist 备份失败: ' + e.message, 'error');
        }
    };

    // 从 Gist 还原隐藏记录
    const gistRestore = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先设置 Token', 'error'); return; }
        try {
            let gistId = STATE.gistId;
            if (!gistId) {
                showPersistentToast('🔍 正在搜索备份 Gist...', 'info');
                gistId = await gistFindByFilename('hidden-tids.json');
                if (!gistId) { showPersistentToast('未找到已有备份 Gist，请先在设置中填入 Gist ID 或执行一次备份', 'error'); return; }
                STATE.gistId = gistId;
                saveState('custom_gist_id', gistId);
            }
            const gist = await gistApi('GET', '/gists/' + gistId);
            const file = gist.files && gist.files['hidden-tids.json'];
            if (!file || !file.content) { showPersistentToast('Gist 中未找到备份文件', 'error'); return; }
            const data = JSON.parse(file.content);
            if (!data.records || !Array.isArray(data.records)) { showPersistentToast('备份数据格式无效', 'error'); return; }
            if (!confirm(`即将从 Gist 还原 ${data.records.length} 条记录（合并到现有 ${STATE.hiddenTids.length} 条），确定继续？`)) return;

            let added = 0;
            const now = Date.now();
            for (const entry of data.records) {
                const tid = Array.isArray(entry) ? entry[0] : entry;
                const ts = (Array.isArray(entry) && entry[1]) ? entry[1] : now;
                const key = 'tid=' + tid;
                if (!HIDDEN_TID_SET.has(key)) {
                    HIDDEN_TID_SET.add(key);
                    STATE.hiddenTids.push([tid, ts]);
                    added++;
                }
            }
            saveState('custom_hidden_tids', STATE.hiddenTids);
            updateHiddenTidsTitle();
            reapplyFilters();
            showPersistentToast('📥 已从 Gist 还原 ' + added + ' 条记录（跳过 ' + (data.records.length - added) + ' 条重复）', 'success');
        } catch (e) {
            showPersistentToast('❌ Gist 还原失败: ' + e.message, 'error');
        }
    };

    // 备份脚本设置到 Gist
    const gistBackupSettings = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先设置 Token', 'error'); return; }
        try {
            await gistSyncAll('✅ ☁️ 已备份脚本设置到 Gist', false, ['script-settings.json']);
        } catch (e) {
            showPersistentToast('❌ ☁️ 设置备份失败: ' + e.message, 'error');
        }
    };

    // 从 Gist 还原脚本设置
    const gistRestoreSettings = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先设置 Token', 'error'); return; }
        try {
            let gistId = STATE.gistId;
            if (!gistId) {
                showPersistentToast('🔍 正在搜索备份 Gist...', 'info');
                gistId = await gistFindByFilename('script-settings.json') || await gistFindByFilename('hidden-tids.json');
                if (!gistId) { showPersistentToast('未找到已有备份 Gist', 'error'); return; }
                STATE.gistId = gistId;
                saveState('custom_gist_id', gistId);
            }
            const gist = await gistApi('GET', '/gists/' + gistId);
            const file = gist.files && gist.files['script-settings.json'];
            if (!file || !file.content) { showPersistentToast('Gist 中未找到设置备份文件', 'error'); return; }
            const data = JSON.parse(file.content);
            if (!data.settings) { showPersistentToast('设置备份数据格式无效', 'error'); return; }
            if (!confirm('即将从 Gist 还原脚本设置，确定继续？')) return;

            const ignoreKeys = ['threadCache', 'isLoadingNextPage', 'nextPageUrl', 'panelMinimized', 'gistToken', 'gistId', 'bookmarks', 'bookmarksGistBackupEnabled', 'bookmarksPanelActiveTab'];
            for (const [k, v] of Object.entries(data.settings)) {
                if (ignoreKeys.includes(k)) continue;
                STATE[k] = v;
                saveState(convertStateKey(k), v);
            }
            showPersistentToast('📥 已从 Gist 还原脚本设置，刷新后生效', 'success');
        } catch (e) {
            showPersistentToast('❌ 设置还原失败: ' + e.message, 'error');
        }
    };

    // 反向映射 STATE key 到 GM_setValue key
    const convertStateKey = (k) => {
        const map = {
            blocked: 'custom_blocked_keywords', blockedUsers: 'custom_blocked_users',
            highlighted: 'custom_highlight_keywords', readLinks: 'custom_read_links',
            autoLoadNextPage: 'custom_auto_load', autoExtractOnLoad: 'custom_auto_extract',
            imageCount: 'custom_image_count', imageSize: 'custom_image_size',
            imageDisplayMode: 'custom_image_display_mode',
            buttonStyle: 'custom_button_style',
            scrollBallEnabled: 'custom_scroll_ball_enabled',
            concurrentEnabled: 'custom_concurrent_enabled', concurrentCount: 'custom_concurrent_count',
            concurrentDelay: 'custom_concurrent_delay',
            offline115Cid: 'offline_115_cid', offline115CidName: 'offline_115_cid_name',
            offline115AutoOpen: 'offline_115_auto_open', offline115Favorites: 'offline_115_favorites',
            offline115FavMax: 'offline_115_fav_max', lightboxCenterRatio: 'custom_lightbox_center',
            offline115NewFolder: 'offline_115_new_folder', offline115Urls: 'offline_115_urls',
            offline115RenameRules: 'offline_115_rename_rules', offline115LogMaxLines: 'offline_115_log_max',
            quickReplyText: 'custom_quick_reply_text', resetWidth: 'custom_reset_width',
            resetWidthPx: 'custom_reset_width_px', hiddenTids: 'custom_hidden_tids',
            hiddenTidsMaxDays: 'custom_hidden_tids_max_days', panelStartMinimized: 'custom_panel_start_minimized',
            bulkLoadPageCount: 'custom_bulk_load_count', autoBulkLoadOnPageLoad: 'custom_auto_bulk_load',
            gistToken: 'custom_gist_token', gistId: 'custom_gist_id',
            gistBackupEnabled: 'custom_gist_backup_enabled',
            bookmarks: 'custom_bookmarks',
            bookmarksGistBackupEnabled: 'custom_bookmarks_gist_backup',
            bookmarksPanelActiveTab: 'custom_bookmarks_active_tab',
            scrollBallX: 'custom_scroll_ball_x', scrollBallY: 'custom_scroll_ball_y',
            scrollSpeed1: 'custom_scroll_speed_1', scrollSpeed2: 'custom_scroll_speed_2',
            scrollSpeed3: 'custom_scroll_speed_3', scrollMaxSpeed: 'custom_scroll_max_speed',
            scrollSensitivity: 'custom_scroll_sensitivity',
            dashboardX: 'custom_dashboard_x', dashboardY: 'custom_dashboard_y',
            dashboardW: 'custom_dashboard_w', dashboardH: 'custom_dashboard_h',
            dashboardPosition: 'custom_dashboard_position', panelPosition: 'custom_panel_position'
        };
        return map[k] || ('custom_' + k);
    };

    // ================= 书签 Gist 云备份/还原 =================
    const gistBookmarksBackup = async (silent) => {
        if (!STATE.gistToken) { if (!silent) showPersistentToast('请先在设置中填写 GitHub Token', 'error'); return; }
        try {
            await gistSyncAll(silent ? null : '✅ ☁️ 已备份收藏夹到 Gist（' + STATE.bookmarks.length + ' 条）', silent, ['bookmarks.json']);
        } catch (e) {
            if (!silent) showPersistentToast('❌ ☁️ 收藏夹备份失败: ' + e.message, 'error');
        }
    };

    const gistBookmarksRestore = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先设置 Token', 'error'); return; }
        try {
            let gistId = STATE.gistId;
            if (!gistId) {
                showPersistentToast('🔍 正在搜索备份 Gist...', 'info');
                gistId = await gistFindByFilename('bookmarks.json') || await gistFindByFilename('hidden-tids.json');
                if (!gistId) { showPersistentToast('未找到已有备份 Gist，请先在设置中填入 Gist ID 或执行一次备份', 'error'); return; }
                STATE.gistId = gistId;
                saveState('custom_gist_id', gistId);
            }
            const gist = await gistApi('GET', '/gists/' + gistId);
            const file = gist.files && gist.files['bookmarks.json'];
            if (!file || !file.content) { showPersistentToast('Gist 中未找到收藏夹备份文件', 'error'); return; }
            const data = JSON.parse(file.content);
            if (!data.records || !Array.isArray(data.records)) { showPersistentToast('备份数据格式无效', 'error'); return; }
            const cloudCount = data.records.length;
            const localCount = STATE.bookmarks.length;
            let confirmMsg = `即将从 Gist 还原 ${cloudCount} 条收藏记录`;
            if (localCount > 0) {
                confirmMsg += `（现有本地 ${localCount} 条）`;
                if (cloudCount < localCount) {
                    confirmMsg += `\n\n⚠️ 云备份比本地少 ${localCount - cloudCount} 条！\n可能云备份不完整（被其他设备的自动备份覆盖）。\n只有云端存在的记录会被合并，本地多余的不会被删除。`;
                }
            }
            confirmMsg += '\n\n建议还原前先用"💾 本地备份"按钮备份当前数据。\n\n确定继续？';
            if (!confirm(confirmMsg)) return;

            let added = 0, updated = 0;
            for (const entry of data.records) {
                if (!entry.tid) continue;
                const existing = STATE.bookmarks.find(b => b.tid === entry.tid);
                if (existing) {
                    existing.type = entry.type || 'important';
                    existing.title = entry.title || existing.title;
                    existing.url = entry.url || existing.url;
                    existing.addedAt = entry.addedAt || existing.addedAt;
                    updated++;
                } else {
                    STATE.bookmarks.push({
                        tid: entry.tid,
                        title: entry.title || '',
                        url: entry.url || '',
                        type: entry.type || 'important',
                        addedAt: entry.addedAt || Date.now()
                    });
                    added++;
                }
            }
            STATE.bookmarks.sort((a, b) => b.addedAt - a.addedAt);
            saveState('custom_bookmarks', STATE.bookmarks);
            buildBookmarksPanel();
            if (isOnListPage()) updateListBmBtns();
            showPersistentToast('📥 已从 Gist 还原：新增 ' + added + ' 条，更新 ' + updated + ' 条（跳过 ' + (data.records.length - added - updated) + ' 条）', 'success');
        } catch (e) {
            showPersistentToast('❌ 收藏夹还原失败: ' + e.message, 'error');
        }
    };

    // 测试 Token 有效性
    const gistTestToken = async () => {
        if (!STATE.gistToken) { showPersistentToast('请先填写 Token', 'error'); return; }
        try {
            const user = await gistApi('GET', '/user');
            showPersistentToast('✅ Token 有效，用户: ' + user.login, 'success');
        } catch (e) {
            showPersistentToast('❌ Token 无效: ' + e.message, 'error');
        }
    };

    btnGroup.appendChild(btnToggleSet);
    btnGroup.appendChild(btnSelectAll);

    // 一次性加载多页按钮
    const btnBulkLoad = createBtn('📄 一次性加载' + STATE.bulkLoadPageCount + '页（自动提取）', '#e67e22');
    btnBulkLoad.onclick = async () => {
        if (STATE.isLoadingNextPage) {
            showToast('正在加载中，请稍候...', 'info');
            return;
        }
        btnBulkLoad.innerText = '⏳ 加载中...';
        btnBulkLoad.disabled = true;
        await bulkLoadPages(STATE.bulkLoadPageCount);
        btnBulkLoad.innerText = '📄 一次性加载' + STATE.bulkLoadPageCount + '页（自动提取）';
        btnBulkLoad.disabled = false;
    };
    btnGroup.appendChild(btnBulkLoad);

    btnGroup.appendChild(btnExtract);
    btnGroup.appendChild(btnOpen);

    const btnOffline115 = createBtn('☁️ 115 离线下载', '#fd7e14');
    btnOffline115.onclick = () => showDashboard('offline115');
    btnGroup.appendChild(btnOffline115);

    // 永久隐藏帖子 —— 共用记录函数（二次扫描，防无缝翻页并发插入）
    const recordCurrentPageTids = async () => {
        const now = Date.now();
        const collectTids = () => {
            const items = [];
            document.querySelectorAll('tbody[id^="normalthread_"]').forEach(tbody => {
                const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
                if (link) {
                    const tidMatch = link.href.match(/tid=(\d+)/);
                    if (tidMatch) items.push({ tid: tidMatch[1], key: 'tid=' + tidMatch[1] });
                }
            });
            return items;
        };

        // 第一次扫描
        const pass1 = collectTids();
        const pass1Added = [];
        for (const item of pass1) {
            if (!HIDDEN_TID_SET.has(item.key)) {
                HIDDEN_TID_SET.add(item.key);
                STATE.hiddenTids.push([item.tid, now]);
                pass1Added.push(item);
            }
        }

        // 等待 300ms，捕获无缝翻页可能刚好完成的并发插入
        await new Promise(r => setTimeout(r, 300));

        // 第二次扫描：只处理第一次没扫到的新增节点
        const pass2 = collectTids();
        const pass2Added = [];
        for (const item of pass2) {
            if (!HIDDEN_TID_SET.has(item.key)) {
                HIDDEN_TID_SET.add(item.key);
                STATE.hiddenTids.push([item.tid, now]);
                pass2Added.push(item);
            }
        }

        saveState('custom_hidden_tids', STATE.hiddenTids);

        // 执行过滤
        let hiddenCount = 0, visibleCount = 0;
        document.querySelectorAll('tbody[id^="normalthread_"]').forEach(tbody => {
            tbody.classList.remove('custom-hidden');
            const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
            if (link) {
                const tidMatch = link.href.match(/tid=(\d+)/);
                if (tidMatch && HIDDEN_TID_SET.has('tid=' + tidMatch[1])) {
                    tbody.classList.add('custom-hidden');
                    const cb = tbody.querySelector('.custom-thread-checkbox');
                    if (cb) cb.checked = false;
                    hiddenCount++;
                } else {
                    visibleCount++;
                }
            }
        });
        // 补充关键词/用户屏蔽过滤
        reapplyFilters();

        const totalAdded = pass1Added.length + pass2Added.length;

        // GitHub Gist 自动备份
        if (totalAdded > 0 && STATE.gistBackupEnabled && STATE.gistToken) {
            setTimeout(() => gistBackup(), 2000);
        }

        return {
            scanned: pass1.length,
            added: totalAdded,
            pass1Added: pass1Added.length,
            pass2Added: pass2Added.length,
            hidden: hiddenCount,
            visible: visibleCount,
            beforeTotal: STATE.hiddenTids.length - totalAdded,
            afterTotal: STATE.hiddenTids.length
        };
    };

    const btnHideTidsRecord = createBtn('📝 记录当前页所有帖子', '#fd7e14');
    btnHideTidsRecord.onclick = async () => {
        const stats = await recordCurrentPageTids();
        const msgs = [
            `📊 扫描 ${stats.scanned} 条帖子`,
            `🆕 新增记录 ${stats.added} 条`,
            stats.pass2Added > 0 ? `⚠️ 第二轮捕获 ${stats.pass2Added} 条（无缝翻页并发）` : '',
            `👁️ 隐藏 ${stats.hidden} 条，可见 ${stats.visible} 条`,
        ].filter(Boolean);
        showToast(msgs.join(' | '), 'info');
    };
    btnGroup.appendChild(btnHideTidsRecord);

    // 解除隐藏：临时显示当前页面帖子（刷新后恢复隐藏）
    const unhideCurrentPageTids = () => {
        let shown = 0;
        document.querySelectorAll('tbody[id^="normalthread_"]').forEach(tbody => {
            const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
            if (link) {
                const tidMatch = link.href.match(/tid=(\d+)/);
                if (tidMatch) {
                    const key = 'tid=' + tidMatch[1];
                    if (HIDDEN_TID_SET.has(key)) {
                        STATE.tempUnhiddenSet.add(key);
                        shown++;
                    }
                }
            }
        });
        if (shown === 0) { showToast('当前页没有已隐藏的帖子', 'info'); return shown; }
        // 移除当前页所有帖子的隐藏状态（仅视觉上，不修改存储）
        document.querySelectorAll('tbody[id^="normalthread_"].custom-hidden').forEach(tbody => {
            tbody.classList.remove('custom-hidden');
        });
        reapplyFilters();
        showToast(`🔓 已临时显示当前页 ${shown} 条帖子（刷新页面后恢复隐藏）`, 'info');
        return shown;
    };

    const btnUnhideTids = createBtn('🔓 临时显示隐藏帖子', '#17a2b8');
    btnUnhideTids.title = '仅当前会话临时显示，刷新页面后恢复隐藏';
    btnUnhideTids.onclick = () => { unhideCurrentPageTids(); };
    btnGroup.appendChild(btnUnhideTids);

    const btnBookmarks = createBtn('📑 收藏夹', '#6f42c1');
    btnBookmarks.onclick = () => showDashboard('bookmarks');
    btnGroup.appendChild(btnBookmarks);

    // 拦截分页跳转：跳转前提示记录当前页帖子
    let _pageNavBusy = false;
    document.addEventListener('click', async (e) => {
        if (_pageNavBusy) return;
        const pgLink = e.target.closest('.pg a[href]');
        const autopbn = e.target.closest('#autopbn');
        if (!pgLink && !autopbn) return;
        // 排除当前页指示器（strong 标签）
        if (!pgLink && e.target.closest('strong')) return;

        // 统计当前页未记录的可见帖子
        let unrecorded = 0;
        document.querySelectorAll('tbody[id^="normalthread_"]:not(.custom-hidden)').forEach(tbody => {
            const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
            if (link) {
                const tidMatch = link.href.match(/tid=(\d+)/);
                if (tidMatch && !HIDDEN_TID_SET.has('tid=' + tidMatch[1])) {
                    unrecorded++;
                }
            }
        });
        if (unrecorded === 0) return;

        e.preventDefault();
        e.stopPropagation();

        const destUrl = pgLink ? pgLink.href : '';

        if (confirm(`⚠️ 当前页有 ${unrecorded} 条帖子未记录，跳转前是否记录？\n\n"确定" = 自动记录并跳转\n"取消" = 不记录直接跳转`)) {
            const stats = await recordCurrentPageTids();
            const msgs = [
                `📊 扫描 ${stats.scanned} 条，新增 ${stats.added} 条`,
                stats.pass2Added > 0 ? `⚠️ 第二轮捕获 ${stats.pass2Added} 条` : '',
                `👁️ 隐藏 ${stats.hidden} 条`,
            ].filter(Boolean);
            showToast(msgs.join(' | '), 'info');
        }

        _pageNavBusy = true;
        if (destUrl && !destUrl.startsWith('javascript:')) {
            window.location.href = destUrl;
        } else if (autopbn) {
            const rel = autopbn.getAttribute('rel') || '';
            if (rel) window.location.href = rel;
        }
    }, true);


    // ================= 收藏夹管理面板 =================
    const bookmarksPanel = document.createElement('div');
    bookmarksPanel.style.cssText = 'display:none; flex-direction:column; gap:8px; background:white; padding:15px; border:1px solid #ccc; border-radius:5px; box-shadow:0 4px 6px rgba(0,0,0,0.1); width:340px; max-height:70vh;';

    const buildBookmarksPanel = () => {
        const activeTab = STATE.bookmarksPanelActiveTab || 'important';
        const filtered = STATE.bookmarks.filter(b => b.type === activeTab);
        // 按日期分组（最新在前）
        const groups = {};
        filtered.forEach(b => {
            const day = new Date(b.addedAt).toISOString().slice(0, 10); // YYYY-MM-DD
            if (!groups[day]) groups[day] = [];
            groups[day].push(b);
        });
        const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // 最新日期在前

        bookmarksPanel.innerHTML = `
            <div style="font-weight:bold; font-size:14px; color:#333; border-bottom:1px dashed #ccc; padding-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                <span>📑 收藏夹（共 ${STATE.bookmarks.length} 条）</span>
                <span id="bm-panel-close" style="cursor:pointer; font-size:18px; color:#999; line-height:1;" title="关闭">×</span>
            </div>
            <div style="display:flex; gap:6px;">
                <button type="button" id="bm-tab-important" style="flex:1; padding:6px; font-size:12px; cursor:pointer; border:none; border-radius:4px; font-weight:bold; color:#fff; background:${activeTab === 'important' ? '#dc3545' : '#e9ecef'}; color:${activeTab === 'important' ? '#fff' : '#333'};">⭐ 重要（${STATE.bookmarks.filter(b => b.type === 'important').length}）</button>
                <button type="button" id="bm-tab-normal" style="flex:1; padding:6px; font-size:12px; cursor:pointer; border:none; border-radius:4px; font-weight:bold; color:#fff; background:${activeTab === 'normal' ? '#007bff' : '#e9ecef'}; color:${activeTab === 'normal' ? '#fff' : '#333'};">📌 一般（${STATE.bookmarks.filter(b => b.type === 'normal').length}）</button>
            </div>
            <div style="display:flex; gap:4px; align-items:center; font-size:11px; color:#888;">
                <span>☁️ 云备份：</span>
                <button type="button" id="bm-gist-backup" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#fd7e14; color:#fff; border:none; border-radius:3px;">备份</button>
                <button type="button" id="bm-gist-restore" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#6f42c1; color:#fff; border:none; border-radius:3px;">还原</button>
                <label style="margin-left:6px; display:flex; align-items:center; gap:2px; cursor:pointer;">
                    <input type="checkbox" id="bm-gist-auto" ${STATE.bookmarksGistBackupEnabled ? 'checked' : ''} style="width:12px; height:12px; cursor:pointer;"> 自动备份
                </label>
            </div>
            <div style="display:flex; gap:4px; align-items:center; font-size:11px; color:#888;">
                <span>💾 本地：</span>
                <button type="button" id="bm-local-backup" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#17a2b8; color:#fff; border:none; border-radius:3px;">备份</button>
                <button type="button" id="bm-local-restore" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#6c757d; color:#fff; border:none; border-radius:3px;">还原</button>
            </div>
            <div id="bm-list-area" style="flex:1; overflow-y:auto; min-height:60px; max-height:350px; font-size:12px;">
                ${sortedDays.length === 0 ? '<div style="text-align:center; color:#999; padding:20px;">暂无收藏</div>' : ''}
            </div>
            <div id="bm-footer" style="display:${sortedDays.length > 0 ? 'flex' : 'none'}; align-items:center; justify-content:space-between; border-top:1px solid #eee; padding-top:6px; font-size:11px;">
                <span>${filtered.length} 条收藏</span>
                <div style="display:flex; gap:4px;">
                    <button type="button" id="bm-open-selected" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#28a745; color:#fff; border:none; border-radius:3px;">📂 打开选中</button>
                    <button type="button" id="bm-del-selected" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#dc3545; color:#fff; border:none; border-radius:3px;">🗑 删除选中</button>
                </div>
            </div>
        `;

        // 绑定事件
        bookmarksPanel.querySelector('#bm-panel-close').onclick = () => { if (_dashboardDB) _dashboardDB.style.display = 'none'; };

        // Tab 切换
        bookmarksPanel.querySelector('#bm-tab-important').onclick = () => {
            STATE.bookmarksPanelActiveTab = 'important';
            saveState('custom_bookmarks_active_tab', 'important');
            buildBookmarksPanel();
        };
        bookmarksPanel.querySelector('#bm-tab-normal').onclick = () => {
            STATE.bookmarksPanelActiveTab = 'normal';
            saveState('custom_bookmarks_active_tab', 'normal');
            buildBookmarksPanel();
        };

        // 云备份事件
        bookmarksPanel.querySelector('#bm-gist-backup').onclick = () => gistBookmarksBackup(false);
        bookmarksPanel.querySelector('#bm-gist-restore').onclick = () => gistBookmarksRestore();
        bookmarksPanel.querySelector('#bm-gist-auto').onchange = (e) => {
            STATE.bookmarksGistBackupEnabled = e.target.checked;
            saveState('custom_bookmarks_gist_backup', e.target.checked);
            if (e.target.checked && STATE.gistToken && STATE.bookmarks.length > 0) {
                setTimeout(() => gistBookmarksBackup(true), 1000);
            }
        };

        // 本地备份收藏夹
        bookmarksPanel.querySelector('#bm-local-backup').onclick = () => {
            if (STATE.bookmarks.length === 0) { showToast('没有可备份的收藏', 'error'); return; }
            const data = {
                version: 1,
                exportedAt: new Date().toISOString(),
                count: STATE.bookmarks.length,
                records: STATE.bookmarks
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ts = new Date().toISOString().slice(0, 10);
            a.download = `bookmarks-backup-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`💾 已备份 ${STATE.bookmarks.length} 条收藏`, 'success');
        };

        // 本地还原收藏夹（合并模式）
        bookmarksPanel.querySelector('#bm-local-restore').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (!data.records || !Array.isArray(data.records)) {
                            showToast('备份文件格式无效', 'error');
                            return;
                        }
                        const count = data.count || data.records.length;
                        let newCount = 0, updateCount = 0;
                        for (const entry of data.records) {
                            if (!entry.tid) continue;
                            const existing = STATE.bookmarks.find(b => b.tid === entry.tid);
                            if (existing) {
                                existing.type = entry.type || existing.type || 'important';
                                existing.title = entry.title || existing.title;
                                existing.url = entry.url || existing.url;
                                existing.addedAt = entry.addedAt || existing.addedAt;
                                updateCount++;
                            } else {
                                STATE.bookmarks.push({
                                    tid: entry.tid,
                                    title: entry.title || '',
                                    url: entry.url || '',
                                    type: entry.type || 'important',
                                    addedAt: entry.addedAt || Date.now()
                                });
                                newCount++;
                            }
                        }
                        STATE.bookmarks.sort((a, b) => b.addedAt - a.addedAt);
                        saveState('custom_bookmarks', STATE.bookmarks);
                        buildBookmarksPanel();
                        if (isOnListPage()) updateListBmBtns();
                        const msg = `📥 已还原：新增 ${newCount} 条，更新 ${updateCount} 条` + (count - newCount - updateCount > 0 ? `（跳过 ${count - newCount - updateCount} 条无效）` : '');
                        showToast(msg, 'success');
                        // 自动云端备份
                        if (STATE.bookmarksGistBackupEnabled && STATE.gistToken && (newCount > 0 || updateCount > 0)) {
                            setTimeout(() => gistBookmarksBackup(true), 1000);
                        }
                    } catch (err) {
                        showToast(`还原失败: ${err.message}`, 'error');
                    }
                };
                reader.readAsText(file);
                input.remove();
            };
            document.body.appendChild(input);
            input.click();
        };

        // 渲染日期分组列表
        const listArea = bookmarksPanel.querySelector('#bm-list-area');
        if (sortedDays.length > 0) {
            sortedDays.forEach(day => {
                const dayItems = groups[day];
                // 日期分组标题
                const dayHeader = document.createElement('div');
                dayHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:6px 0; margin-top:6px; border-bottom:1px solid #eee;';
                dayHeader.innerHTML = `<span style="font-weight:bold; color:#555;">📅 ${day}（${dayItems.length}条）</span>`;
                const dayBtnRow = document.createElement('span');
                dayBtnRow.style.cssText = 'display:flex; gap:4px;';
                const daySelAll = document.createElement('button');
                daySelAll.type = 'button'; daySelAll.innerText = '全选';
                daySelAll.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#6c757d; color:#fff; border:none; border-radius:2px;';
                daySelAll.onclick = () => {
                    const cbs = listArea.querySelectorAll(`input[data-day="${day}"]`);
                    const allChecked = [...cbs].every(cb => cb.checked);
                    cbs.forEach(cb => { cb.checked = !allChecked; });
                };
                dayBtnRow.appendChild(daySelAll);
                const dayDelAll = document.createElement('button');
                dayDelAll.type = 'button'; dayDelAll.innerText = '删除全部';
                dayDelAll.style.cssText = 'font-size:10px; cursor:pointer; padding:1px 6px; background:#dc3545; color:#fff; border:none; border-radius:2px;';
                dayDelAll.onclick = () => {
                    if (!confirm(`确定删除 ${day} 的全部 ${dayItems.length} 条收藏？`)) return;
                    dayItems.forEach(b => {
                        removeBookmarkWithoutGist(b.tid);
                    });
                    if (STATE.bookmarksGistBackupEnabled && STATE.gistToken) {
                        setTimeout(() => gistBookmarksBackup(true), 1000);
                    }
                    buildBookmarksPanel();
                    if (isOnListPage()) updateListBmBtns();
                    showToast(`已删除 ${day} 的 ${dayItems.length} 条收藏`, 'success');
                };
                dayBtnRow.appendChild(dayDelAll);
                dayHeader.appendChild(dayBtnRow);
                listArea.appendChild(dayHeader);

                // 每个收藏项
                dayItems.sort((a, b) => b.addedAt - a.addedAt); // 同天内最新在前
                dayItems.forEach(b => {
                    const item = document.createElement('div');
                    item.style.cssText = 'display:flex; align-items:center; gap:4px; padding:3px 0; border-bottom:1px solid #f5f5f5;';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = b.tid;
                    cb.dataset.day = day;
                    cb.style.cssText = 'width:13px; height:13px; cursor:pointer; margin:0; flex-shrink:0;';
                    item.appendChild(cb);
                    const titleLink = document.createElement('a');
                    titleLink.href = b.url;
                    titleLink.innerText = b.title || b.url;
                    titleLink.style.cssText = 'flex:1; font-size:11px; color:#007bff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:none;';
                    titleLink.target = '_blank';
                    titleLink.onclick = (e) => { e.stopPropagation(); };
                    item.appendChild(titleLink);
                    const timeSpan = document.createElement('span');
                    timeSpan.style.cssText = 'font-size:10px; color:#999; white-space:nowrap; flex-shrink:0;';
                    const t = new Date(b.addedAt);
                    timeSpan.innerText = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0');
                    item.appendChild(timeSpan);
                    const delBtn = document.createElement('button');
                    delBtn.type = 'button'; delBtn.innerText = '×';
                    delBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:0 4px; background:none; border:1px solid #dc3545; color:#dc3545; border-radius:2px; flex-shrink:0; line-height:1;';
                    delBtn.title = '删除';
                    delBtn.onclick = () => {
                        removeBookmark(b.tid);
                        buildBookmarksPanel();
                        if (isOnListPage()) updateListBmBtns();
                        showToast('已删除收藏', 'info');
                    };
                    item.appendChild(delBtn);
                    listArea.appendChild(item);
                });
            });
        }

        // 底部全选 / 删除选中
        const footerSelAll = bookmarksPanel.querySelector('#bm-footer');
        if (footerSelAll) {
            // 全局全选
            const selectAllCb = document.createElement('input');
            selectAllCb.type = 'checkbox';
            selectAllCb.style.cssText = 'width:13px; height:13px; cursor:pointer; margin:0 4px 0 0;';
            selectAllCb.onchange = () => {
                listArea.querySelectorAll('input[type="checkbox"]').forEach(cb2 => { cb2.checked = selectAllCb.checked; });
            };
            footerSelAll.querySelector('span').prepend(selectAllCb);

            footerSelAll.querySelector('#bm-open-selected').onclick = () => {
                const checkedCbs = listArea.querySelectorAll('input[type="checkbox"]:checked');
                if (checkedCbs.length === 0) { showToast('请先勾选收藏', 'error'); return; }
                checkedCbs.forEach(cb2 => {
                    const bm = STATE.bookmarks.find(b => b.tid === cb2.value);
                    if (bm) GM_openInTab(bm.url, { active: false, insert: true });
                });
                showToast(`已打开 ${checkedCbs.length} 个帖子`, 'success');
            };
            footerSelAll.querySelector('#bm-del-selected').onclick = () => {
                const checkedCbs = listArea.querySelectorAll('input[type="checkbox"]:checked');
                if (checkedCbs.length === 0) { showToast('请先勾选收藏', 'error'); return; }
                if (!confirm(`确定删除选中的 ${checkedCbs.length} 条收藏？`)) return;
                checkedCbs.forEach(cb2 => { removeBookmarkWithoutGist(cb2.value); });
                if (STATE.bookmarksGistBackupEnabled && STATE.gistToken) {
                    setTimeout(() => gistBookmarksBackup(true), 1000);
                }
                buildBookmarksPanel();
                if (isOnListPage()) updateListBmBtns();
                showToast(`已删除 ${checkedCbs.length} 条收藏`, 'success');
            };
        }
    };

    // 不带 Gist 备份的删除（批量删除时用，最后统一备份）
    const removeBookmarkWithoutGist = (tid) => {
        STATE.bookmarks = STATE.bookmarks.filter(b => b.tid !== tid);
        saveState('custom_bookmarks', STATE.bookmarks);
    };

    // 判断是否在列表页
    const isOnListPage = () => !!document.querySelector('tbody[id^="normalthread_"]');

    // 更新列表页收藏按钮状态（删除/添加收藏后刷新星标透明度）
    const updateListBmBtns = () => {
        const isCircle = STATE.buttonStyle === 'circle';
        const inactiveOpacity = isCircle ? '0.45' : '0.55';
        document.querySelectorAll('tbody[id^="normalthread_"]').forEach(tbody => {
            const link = tbody.querySelector('a.xst') || tbody.querySelector('th a[href*="thread-"]');
            if (!link) return;
            const tid = (link.href.match(/tid=(\d+)/) || [])[1];
            if (!tid) return;
            const curType = getBookmarkType(tid);
            // 提取区内的收藏按钮
            tbody.querySelectorAll('.custom-extracted button[data-bm-type]').forEach(btn => {
                btn.style.opacity = btn.dataset.bmType === curType ? '1' : inactiveOpacity;
            });
        });
    };

    buildBookmarksPanel();

    panel.appendChild(settingsPanel);
    panel.appendChild(offline115Panel);
    panel.appendChild(bookmarksPanel);
    panel.appendChild(btnGroup);
    // 面板溢出时滚动
    panel.style.maxHeight = 'calc(100vh - 100px)';
    panel.style.overflowY = 'auto';
    document.body.appendChild(panel);

    // ================= Dashboard 居中面板 =================
    let _activeDashboardTab = 'bookmarks';
    let _dashboardDB = null;
    let _dashboardTabBtns = {};
    let _dashboardPanes = {};

    const switchDashboardTab = (name) => {
        _activeDashboardTab = name;
        const db = _dashboardDB;
        if (!db) return;
        Object.keys(_dashboardTabBtns).forEach(k => {
            _dashboardTabBtns[k].style.color = k === name ? '#007bff' : '#666';
            _dashboardTabBtns[k].style.borderBottomColor = k === name ? '#007bff' : 'transparent';
        });
        Object.keys(_dashboardPanes).forEach(k => {
            _dashboardPanes[k].style.display = k === name ? '' : 'none';
        });
        // 懒渲染
        if (name === 'bookmarks' && !_dashboardPanes.bookmarks.hasChildNodes()) renderBookmarksPane(_dashboardPanes.bookmarks);
        if (name === 'settings' && !_dashboardPanes.settings.hasChildNodes()) renderSettingsPane(_dashboardPanes.settings);
        if (name === 'offline115' && !_dashboardPanes.offline115.hasChildNodes()) render115Pane(_dashboardPanes.offline115);
    };

    const showDashboard = (tabName) => {
        const db = _dashboardDB;
        if (!db) { createDashboard(); return; }
        const wasVisible = db.style.display === 'flex';
        // 同一按钮再次点击 = 关闭面板
        if (wasVisible && tabName && _activeDashboardTab === tabName) {
            db.style.display = 'none';
            return;
        }
        if (tabName) _activeDashboardTab = tabName;
        db.style.display = 'flex';
        switchDashboardTab(_activeDashboardTab);
    };

    // ---- 收藏夹 Pane ----
    const renderBookmarksPane = (pane) => {
        pane.appendChild(bookmarksPanel);
        bookmarksPanel.style.display = '';
        bookmarksPanel.style.width = '100%';
        bookmarksPanel.style.maxHeight = 'none';
        bookmarksPanel.style.border = 'none';
        bookmarksPanel.style.boxShadow = 'none';
        bookmarksPanel.style.padding = '0';
        buildBookmarksPanel();
    };

    // ---- 设置 Pane ----
    const renderSettingsPane = (pane) => {
        pane.appendChild(settingsPanel);
        settingsPanel.style.display = '';
        settingsPanel.style.width = '100%';
        settingsPanel.style.border = 'none';
        settingsPanel.style.boxShadow = 'none';
        settingsPanel.style.padding = '0';
        settingsPanel.style.gap = '6px';
    };

    // ---- 115 Pane ----
    const render115Pane = (pane) => {
        pane.style.cssText = 'display:flex;gap:12px;';
        const leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex:1;min-width:0;';
        const rightCol = document.createElement('div');
        rightCol.style.cssText = 'width:240px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;';
        while (offline115Panel.children.length > 0) {
            const child = offline115Panel.children[0];
            if (child.id === 'offline115-log' || child.id === 'offline115-quota') {
                rightCol.appendChild(child);
            } else {
                leftCol.appendChild(child);
            }
        }
        const logEl = rightCol.querySelector('#offline115-log');
        if (logEl) { logEl.style.maxHeight = '300px'; logEl.style.flex = '1'; }
        const quotaEl = rightCol.querySelector('#offline115-quota');
        if (quotaEl) quotaEl.style.borderTop = 'none';
        pane.appendChild(leftCol);
        pane.appendChild(rightCol);
        offline115Panel.style.display = '';
        offline115Panel.style.width = '100%';
        offline115Panel.style.border = 'none';
        offline115Panel.style.boxShadow = 'none';
        offline115Panel.style.padding = '0';
    };

    const createDashboard = () => {
        const db = document.createElement('div');
        db.id = 'custom-dashboard';
        _dashboardDB = db;
        const w = STATE.dashboardW || 750;
        const h = STATE.dashboardH || 520;
        db.style.cssText = `position:fixed;z-index:250000;width:${w}px;height:${h}px;background:#fff;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.25);display:none;flex-direction:column;min-width:420px;min-height:320px;`;
        // 根据预设位置或拖拽坐标定位
        const pos = STATE.dashboardPosition || 'center';
        const applyDashboardPos = (p) => {
            db.style.transform = ''; db.style.left = ''; db.style.right = ''; db.style.top = ''; db.style.bottom = '';
            switch (p) {
                case 'bottom-right':
                    db.style.right = '50px'; db.style.bottom = '50px'; break;
                case 'top-left':
                    db.style.left = '50px'; db.style.top = '50px'; break;
                case 'center':
                default:
                    db.style.left = '50%'; db.style.top = '50%';
                    db.style.transform = 'translate(-50%, -50%)'; break;
            }
        };
        applyDashboardPos(pos);

        // 标题栏（拖拽把手）
        const titleBar = document.createElement('div');
        titleBar.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#f0f2f5;border-radius:8px 8px 0 0;cursor:move;user-select:none;border-bottom:1px solid #e0e0e0;';
        const titleText = document.createElement('span');
        titleText.style.cssText = 'font-size:13px;font-weight:bold;color:#333;';
        titleText.innerText = '📋 论坛小脚本控制台';
        titleBar.appendChild(titleText);
        const closeBtn = document.createElement('span');
        closeBtn.style.cssText = 'cursor:pointer;font-size:18px;color:#999;line-height:1;padding:0 4px;';
        closeBtn.innerText = '×';
        closeBtn.title = '关闭';
        closeBtn.onclick = () => { db.style.display = 'none'; };
        titleBar.appendChild(closeBtn);
        db.appendChild(titleBar);

        // Tab 栏
        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'flex-shrink:0;display:flex;gap:0;background:#fafafa;border-bottom:2px solid #e0e0e0;';
        const tabs = [
            { id: 'bookmarks', label: '📑 收藏夹' },
            { id: 'settings', label: '⚙️ 设置' },
            { id: 'offline115', label: '☁️ 115 离线' }
        ];
        _dashboardTabBtns = {};
        tabs.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'flex:1;padding:8px 0;font-size:13px;font-weight:bold;cursor:pointer;border:none;background:transparent;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.15s;';
            btn.innerText = t.label;
            btn.onclick = () => { _activeDashboardTab = t.id; switchDashboardTab(t.id); };
            _dashboardTabBtns[t.id] = btn;
            tabBar.appendChild(btn);
        });
        db.appendChild(tabBar);

        // 内容区
        const contentArea = document.createElement('div');
        contentArea.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;min-height:0;';
        db.appendChild(contentArea);

        _dashboardPanes = {};
        ['bookmarks', 'settings', 'offline115'].forEach(id => {
            const pane = document.createElement('div');
            pane.id = 'db-pane-' + id;
            pane.style.cssText = 'display:none;';
            contentArea.appendChild(pane);
            _dashboardPanes[id] = pane;
        });

        // 拖拽
        let dragInfo = null;
        titleBar.onmousedown = (e) => {
            if (e.target === closeBtn) return;
            dragInfo = { sx: e.clientX, sy: e.clientY, l: db.offsetLeft, t: db.offsetTop };
            db.style.transform = '';
            db.style.left = dragInfo.l + 'px';
            db.style.top = dragInfo.t + 'px';
            e.preventDefault();
        };
        document.addEventListener('mousemove', (e) => {
            if (!dragInfo) return;
            const nl = Math.max(0, Math.min(window.innerWidth - 100, dragInfo.l + (e.clientX - dragInfo.sx)));
            const nt = Math.max(0, Math.min(window.innerHeight - 40, dragInfo.t + (e.clientY - dragInfo.sy)));
            db.style.left = nl + 'px'; db.style.top = nt + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!dragInfo) return;
            STATE.dashboardX = db.offsetLeft; STATE.dashboardY = db.offsetTop;
            saveState('custom_dashboard_x', STATE.dashboardX); saveState('custom_dashboard_y', STATE.dashboardY);
            dragInfo = null;
        });

        // 右下角缩放把手
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = 'position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#ccc 50%,#ccc 60%,transparent 60%,transparent 70%,#ccc 70%,#ccc 80%,transparent 80%);';
        resizeHandle.title = '拖拽调整大小';
        db.appendChild(resizeHandle);
        let resizeInfo = null;
        resizeHandle.onmousedown = (e) => {
            resizeInfo = { sx: e.clientX, sy: e.clientY, w: db.offsetWidth, h: db.offsetHeight };
            e.preventDefault(); e.stopPropagation();
        };
        document.addEventListener('mousemove', (e) => {
            if (!resizeInfo) return;
            db.style.width = Math.max(420, resizeInfo.w + (e.clientX - resizeInfo.sx)) + 'px';
            db.style.height = Math.max(320, resizeInfo.h + (e.clientY - resizeInfo.sy)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!resizeInfo) return;
            STATE.dashboardW = db.offsetWidth; STATE.dashboardH = db.offsetHeight;
            saveState('custom_dashboard_w', STATE.dashboardW); saveState('custom_dashboard_h', STATE.dashboardH);
            resizeInfo = null;
        });

        document.body.appendChild(db);
        switchDashboardTab(_activeDashboardTab);
        db.style.display = 'flex';
    };
    const BALL_SIZE = 66;
    const BALL_GAP = 8;
    const BALL_CSS = (right, bg) =>
        `position:fixed; bottom:50px; right:${right}px; z-index:100000; width:${BALL_SIZE}px; height:${BALL_SIZE}px; background:${bg}; color:#fff; border-radius:50%; display:none; align-items:center; justify-content:center; cursor:pointer; font-size:24px; font-weight:bold; box-shadow:0 4px 16px rgba(0,0,0,0.3); user-select:none;`;

    // 齿轮小球（展开面板）
    const minimizeBall = document.createElement('div');
    minimizeBall.style.cssText = BALL_CSS(50, '#007bff');
    minimizeBall.innerText = '⚙';
    minimizeBall.title = '展开面板';
    minimizeBall.onclick = () => {
        panel.style.display = ''; minimizeBall.style.display = 'none'; unhideMiniBall.style.display = 'none'; login115Ball.style.display = 'none'; recordMiniBall.style.display = 'none';
        minimizeBtn.style.display = 'flex';
        STATE.panelMinimized = false;
    };
    document.body.appendChild(minimizeBall);

    // 解除隐藏小球（位于展开按钮正上方）
    const unhideMiniBall = document.createElement('div');
    unhideMiniBall.style.cssText = BALL_CSS(50, '#17a2b8').replace('bottom:50px', 'bottom:' + (50 + BALL_SIZE + BALL_GAP) + 'px');
    unhideMiniBall.innerText = '🔓';
    unhideMiniBall.title = '临时显示当前页隐藏帖子（刷新后恢复）';
    unhideMiniBall.onclick = (e) => {
        e.stopPropagation();
        unhideCurrentPageTids();
    };
    document.body.appendChild(unhideMiniBall);

    // 115网盘登录小球
    const r115 = 50 + BALL_SIZE + BALL_GAP;
    const login115Ball = document.createElement('div');
    login115Ball.style.cssText = BALL_CSS(r115, '#21b553');
    login115Ball.innerText = '🔗';
    login115Ball.title = '打开115网盘登录';
    login115Ball.onclick = (e) => {
        e.stopPropagation();
        GM_openInTab('https://115.com/', { active: true });
    };
    document.body.appendChild(login115Ball);

    // 记录小球（记录当前页）
    const r2 = r115 + BALL_SIZE + BALL_GAP;
    const recordMiniBall = document.createElement('div');
    recordMiniBall.style.cssText = BALL_CSS(r2, '#fd7e14');
    recordMiniBall.innerText = '📝';
    recordMiniBall.title = '记录当前页所有帖子';
    recordMiniBall.onclick = async (e) => {
        e.stopPropagation();
        const stats = await recordCurrentPageTids();
        if (stats.added > 0) {
            const msgs = [
                `📊 扫描 ${stats.scanned} 条，新增 ${stats.added} 条`,
                stats.pass2Added > 0 ? `⚠️ 第二轮捕获 ${stats.pass2Added} 条` : '',
                `👁️ 隐藏 ${stats.hidden} 条`,
            ].filter(Boolean);
            showToast(msgs.join(' | '), 'info');
        } else {
            showToast(`📊 扫描 ${stats.scanned} 条，无新帖需要记录`, 'info');
        }
    };
    document.body.appendChild(recordMiniBall);

    // ================= 滚动小球 =================
    const SCROLL_BALL = (() => {
        const b = document.createElement('div');
        const SIZE = 88;
        const cx = STATE.scrollBallX, cy = STATE.scrollBallY;
        const defX = window.innerWidth - 180, defY = window.innerHeight / 2 - SIZE / 2;
        b.style.cssText = `position:fixed;z-index:150000;width:${SIZE}px;height:${SIZE}px;border-radius:50%;background:rgba(0,123,255,0.82);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,0.3);user-select:none;left:${cx != null ? cx : defX}px;top:${cy != null ? cy : defY}px;cursor:grab;transition:background 0.2s;`;
        b.title = '向下拖=滚动 | 左滑锁定 | 右滑取消 | 按住上沿拖=移动';
        // 列表页或详情页，页面可滚动就显示
        if (document.body.scrollHeight > window.innerHeight * 1.2) { b.style.display = 'flex'; }
        else { b.style.display = 'none'; }

        let _mode = 'idle'; // idle | dragging | locked
        let _speed = 0, _dir = 1; // px/frame, 1=down -1=up
        let _raf = null;
        let _drag = null; // { ox, oy, sx, sy, type:'scroll'|'move' }

        const _updateDisplay = () => {
            if (_mode === 'idle') {
                b.innerHTML = '<span style="font-size:22px">⏬</span><span style="font-size:10px;opacity:0.7">拖拽</span>';
                b.style.background = 'rgba(0,123,255,0.82)';
            } else if (_mode === 'dragging') {
                const spd = Math.round(_speed);
                b.innerHTML = `<span style="font-size:20px;font-weight:bold">${spd}px</span><span style="font-size:12px">${_dir > 0 ? '↓' : '↑'}</span>`;
                b.style.background = 'rgba(253,126,20,0.9)';
            } else if (_mode === 'locked') {
                const spd = Math.round(_speed);
                b.innerHTML = `<span style="font-size:18px;font-weight:bold">${spd}px</span><span style="font-size:10px">🔒 ${_dir > 0 ? '↓' : '↑'}</span>`;
                b.style.background = 'rgba(220,53,69,0.9)';
            }
        };

        const _doScroll = () => {
            if (_mode === 'dragging' || _mode === 'locked') {
                window.scrollBy(0, _speed * _dir / 60);
                _raf = requestAnimationFrame(_doScroll);
            }
        };

        const _startRaf = () => { if (!_raf) _raf = requestAnimationFrame(_doScroll); };
        const _stopRaf = () => { if (_raf) { cancelAnimationFrame(_raf); _raf = null; } };

        const _onDown = (e) => {
            e.preventDefault();
            const rect = b.getBoundingClientRect();
            const relX = e.clientX - rect.left, relY = e.clientY - rect.top;
            _drag = {
                ox: e.clientX, oy: e.clientY,
                sx: b.offsetLeft, sy: b.offsetTop,
                type: relY < 30 ? 'move' : 'scroll',
                dir: 0, dist: 0
            };
            if (_drag.type === 'move') { b.style.cursor = 'move'; }
            else { b.style.cursor = 'grabbing'; _startRaf(); }
            if (_mode === 'locked') {
                _mode = 'idle'; _speed = 0; _stopRaf(); _updateDisplay(); return;
            }
            _mode = (_drag.type === 'move') ? _mode : 'dragging';
            _updateDisplay();
        };

        const _onMove = (e) => {
            if (!_drag) return;
            const dx = e.clientX - _drag.ox, dy = e.clientY - _drag.oy;
            if (_drag.type === 'move') {
                const nl = Math.max(0, Math.min(window.innerWidth - SIZE, _drag.sx + dx));
                const nt = Math.max(0, Math.min(window.innerHeight - SIZE, _drag.sy + dy));
                b.style.left = nl + 'px'; b.style.top = nt + 'px';
                return;
            }
            _drag.dist = Math.abs(dy);
            _drag.dir = dy > 0 ? 1 : -1;
            const sens = STATE.scrollSensitivity || 2;
            const maxSpd = STATE.scrollMaxSpeed || 600;
            _speed = Math.min(maxSpd, _drag.dist * sens);
            _dir = _drag.dir;
            if (dx < -50) {
                _mode = 'locked'; b.style.cursor = 'grab'; _drag = null; _updateDisplay(); return;
            }
            if (dx > 50) {
                _mode = 'idle'; _speed = 0; b.style.cursor = 'grab'; _drag = null; _stopRaf(); _updateDisplay(); return;
            }
            _updateDisplay();
        };

        const _onUp = (e) => {
            if (!_drag) return;
            if (_drag.type === 'move') {
                STATE.scrollBallX = b.offsetLeft; STATE.scrollBallY = b.offsetTop;
                saveState('custom_scroll_ball_x', STATE.scrollBallX); saveState('custom_scroll_ball_y', STATE.scrollBallY);
            } else if (_drag.type === 'scroll' && _mode === 'dragging') {
                _mode = 'idle'; _speed = 0; _stopRaf();
            }
            b.style.cursor = 'grab'; _drag = null; _updateDisplay();
        };

        b.addEventListener('mousedown', _onDown);
        document.addEventListener('mousemove', _onMove);
        document.addEventListener('mouseup', _onUp);
        // 手动滚轮 / 按键 → 取消自动滚动
        window.addEventListener('wheel', () => { if (_mode === 'locked') { _mode = 'idle'; _speed = 0; _stopRaf(); _updateDisplay(); } }, { passive: true });
        window.addEventListener('keydown', () => { if (_mode === 'locked') { _mode = 'idle'; _speed = 0; _stopRaf(); _updateDisplay(); } }, { passive: true });

        // 页面可滚动就显示（同时受开关控制）
        const _checkVisibility = () => {
            if (!STATE.scrollBallEnabled) { b.style.display = 'none'; return; }
            if (document.body.scrollHeight > window.innerHeight * 1.2) {
                b.style.display = 'flex';
            }
        };
        _checkVisibility();
        // 监听 DOM 变化 + 滚动（多页加载后页面变长）
        const _obs = new MutationObserver(_checkVisibility);
        _obs.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('scroll', _checkVisibility, { passive: true });
        _updateDisplay();
        return b;
    })();
    document.body.appendChild(SCROLL_BALL);

    // 面板右上角折叠按钮
    const minimizeBtn = document.createElement('div');
    minimizeBtn.style.cssText = 'position:absolute; top:-16px; right:-16px; width:32px; height:32px; background:#dc3545; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; box-shadow:0 2px 8px rgba(0,0,0,0.2); z-index:1;';
    minimizeBtn.innerText = '−';
    minimizeBtn.title = '折叠面板';
    minimizeBtn.style.position = 'fixed';
    minimizeBtn.style.bottom = 'auto';
    minimizeBtn.style.top = 'auto';
    minimizeBtn.onclick = (e) => {
        e.stopPropagation();
        panel.style.display = 'none'; minimizeBall.style.display = 'flex'; unhideMiniBall.style.display = 'flex'; login115Ball.style.display = 'flex'; recordMiniBall.style.display = 'flex';
        STATE.panelMinimized = true;
        minimizeBtn.style.display = 'none';
    };
    minimizeBall.onclick = () => {
        panel.style.display = ''; minimizeBall.style.display = 'none'; unhideMiniBall.style.display = 'none'; login115Ball.style.display = 'none'; recordMiniBall.style.display = 'none'; minimizeBtn.style.display = 'flex';
        STATE.panelMinimized = false;
    };
    document.body.appendChild(minimizeBtn);

    // 定位折叠按钮到面板右上角
    const updateMinBtnPos = () => {
        if (panel.style.display === 'none') { minimizeBtn.style.display = 'none'; return; }
        const rect = panel.getBoundingClientRect();
        minimizeBtn.style.display = 'flex';
        minimizeBtn.style.top = (rect.top - 16) + 'px';
        minimizeBtn.style.left = (rect.right - 16) + 'px';
    };
    updateMinBtnPos();
    // 监听面板变化（简单轮询或用 ResizeObserver）
    new MutationObserver(updateMinBtnPos).observe(panel, { attributes: true, childList: true, subtree: true });
    window.addEventListener('resize', updateMinBtnPos);
    window.addEventListener('scroll', updateMinBtnPos);

    // ================= 启动时应用面板默认状态 =================
    if (STATE.panelStartMinimized) {
        panel.style.display = 'none';
        minimizeBall.style.display = 'flex';
        unhideMiniBall.style.display = 'flex';
        login115Ball.style.display = 'flex';
        recordMiniBall.style.display = 'flex';
        minimizeBtn.style.display = 'none';
        STATE.panelMinimized = true;
    }

    // ================= 启动时自动执行多页加载 =================
    if (STATE.autoBulkLoadOnPageLoad && threadListContainer) {
        setTimeout(() => {
            bulkLoadPages(STATE.bulkLoadPageCount);
        }, 1000);
    }

    // ================= 启动时自动全选并提取 =================
    // 如果开启了自动多页加载且有下一页，则由 bulkLoadPages 统一处理提取，此处跳过
    // 如果没有下一页（帖子太少），自动多页加载会直接 return，此时仍需此处兜底提取
    const _hasNextPage = !!document.querySelector('a.nxt');
    if (STATE.autoExtractOnLoad && !(STATE.autoBulkLoadOnPageLoad && _hasNextPage)) {
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
        showDashboard('offline115');
    }

    // ================= 帖子详情页：内联 TXT/ZIP 内容展示 =================
    const initDetailPage = async () => {
        const postList = document.querySelector('#postlist');
        if (!postList) return;
        // 排除列表页（有多个 normalthread tbody 的是列表页）
        if (document.querySelector('tbody[id^="normalthread_"]')) return;

        const toAbs = (raw) => { try { return new URL(raw, location.href).href; } catch(e) { return raw; } };
        const allMergedTexts = [];

        // ---- 收藏按钮（详情页顶部） ----
        (() => {
            const _detailTid = (location.href.match(/tid=(\d+)/) || [])[1];
            if (!_detailTid) return;
            const _detailTitle = (() => {
                const t = document.querySelector('#thread_subject') || document.querySelector('h1.ts') || document.querySelector('title');
                return t ? t.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : location.href;
            })();
            const _bmDetailWrap = document.createElement('div');
            _bmDetailWrap.style.cssText = 'max-width:980px; margin:0 auto 12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
            const _mkDetailBmBtn = (type, label, bgColor) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.innerText = label;
                const _curType = getBookmarkType(_detailTid);
                btn.style.cssText = `padding:5px 14px; font-size:13px; cursor:pointer; background:${bgColor}; color:#fff; border:none; border-radius:4px; font-weight:bold; opacity:${_curType === type ? '1' : '0.6'};`;
                btn.onclick = () => {
                    if (isBookmarked(_detailTid) && getBookmarkType(_detailTid) === type) {
                        removeBookmark(_detailTid);
                        showToast('已取消收藏', 'info');
                        btn.style.opacity = '0.6';
                    } else {
                        addBookmark(_detailTid, _detailTitle, location.href, type);
                        showToast(`已收藏为${type === 'important' ? '重要⭐' : '一般📌'}`, 'success');
                        btn.style.opacity = '1';
                        const other = _bmDetailWrap.querySelector(type === 'important' ? '.custom-bm-detail-normal' : '.custom-bm-detail-important');
                        if (other) other.style.opacity = '0.6';
                    }
                };
                btn.className = type === 'important' ? 'custom-bm-detail-important' : 'custom-bm-detail-normal';
                return btn;
            };
            _bmDetailWrap.appendChild(_mkDetailBmBtn('important', '⭐ 收藏为重要帖子', '#dc3545'));
            _bmDetailWrap.appendChild(_mkDetailBmBtn('normal', '📌 收藏为一般帖子', '#007bff'));
            const _insertTarget = postList.parentNode || document.body;
            _insertTarget.insertBefore(_bmDetailWrap, postList);
        })();


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
                pushBtn.style.cssText = 'display:inline-block; font-size:12px; cursor:pointer; padding:0 8px; margin-left:3px; background:#fd7e14; color:#fff; border:none; border-radius:2px; vertical-align:baseline; line-height:1.4;';
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
                        inlinePushBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 16px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
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
                topPushAllBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:4px 24px; background:#fd7e14; color:#fff; border:none; border-radius:3px; font-weight:bold;';
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
                    lineCopyBtn.style.cssText = 'font-size:11px; cursor:pointer; padding:2px 8px; background:#6c757d; color:#fff; border:none; border-radius:3px; flex-shrink:0; font-weight:bold;';
                    lineCopyBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); navigator.clipboard.writeText(link).then(() => { lineCopyBtn.innerText = '已复制'; setTimeout(() => lineCopyBtn.innerText = '复制', 1500); }); };
                    lineDiv.appendChild(lineCopyBtn);

                    const linePushBtn = document.createElement('button');
                    linePushBtn.type = 'button'; linePushBtn.innerText = '☁️';
                     linePushBtn.style.cssText = 'font-size:12px; cursor:pointer; padding:2px 16px; background:#fd7e14; color:#fff; border:none; border-radius:3px; flex-shrink:0; font-weight:bold;';
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

    // ================= 详情页：强制加载所有懒加载图片 =================
    const forceLoadImages = (container) => {
        const imgs = (container || document).querySelectorAll('.t_f img, .pcb img, img[file], img[zoomfile]');
        imgs.forEach(img => {
            const realSrc = img.getAttribute('file') || img.getAttribute('zoomfile');
            if (realSrc && img.src !== realSrc) {
                img.src = realSrc;
                img.removeAttribute('file');
                img.removeAttribute('zoomfile');
                img.classList.remove('lazy', 'imgzoom');
                img.removeAttribute('data-src');
                img.removeAttribute('data-original');
            }
        });
    };

    // 仅在详情页执行（非列表页）
    if (!document.querySelector('tbody[id^="normalthread_"]')) {
        // 强制加载当前所有帖子中的懒加载图片
        forceLoadImages();

        // 监听动态新增（如 AJAX 翻页加载新楼层），自动替换新图片
        const postlist = document.querySelector('#postlist');
        if (postlist) {
            const detailImgObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'IMG') {
                                const realSrc = node.getAttribute('file') || node.getAttribute('zoomfile');
                                if (realSrc && node.src !== realSrc) {
                                    node.src = realSrc;
                                    node.removeAttribute('file');
                                    node.removeAttribute('zoomfile');
                                    node.classList.remove('lazy', 'imgzoom');
                                }
                            } else if (node.querySelectorAll) {
                                forceLoadImages(node);
                            }
                        }
                    });
                }
            });
            detailImgObserver.observe(postlist, { childList: true, subtree: true });
        }

        initDetailPage();
    }

})();