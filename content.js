// YT Click-to-Queue & Auto-Playlist — content script.
// The queue and the dated playlists live in chrome.storage.local, so they
// survive YouTube redesigns, reloads and browser restarts, and every open
// tab sees the same queue.
(() => {
  if (window.__ytClickToQueue) return;
  window.__ytClickToQueue = true;

  const PLAY_LIMIT = 50; // watch_videos accepts at most 50 IDs
  const CARD = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytd-reel-item-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
  ].join(",");

  const state = { queueMode: false, queue: [], archives: {}, panelOpen: false };

  // Local calendar date. toISOString() would give the UTC date and file
  // evening sessions under tomorrow for anyone west of Greenwich.
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const idFromHref = (href) => {
    try {
      const u = new URL(href, location.origin);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
      let id = null;
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else id = (u.pathname.match(/^\/shorts\/([\w-]{11})/) || [])[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  };

  const titleOf = (card, link) => {
    const el = card.querySelector(
      "#video-title, .yt-lockup-metadata-view-model__title, h3 a, h3, [title]"
    );
    const text =
      el?.textContent?.trim() ||
      el?.getAttribute("title") ||
      link.getAttribute("title") ||
      link.getAttribute("aria-label") ||
      "";
    return text.replace(/\s+/g, " ").trim() || "Untitled video";
  };

  const watchUrl = (ids) =>
    `https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, PLAY_LIMIT).join(",")}`;

  // ---------- storage ----------

  const save = (patch) => chrome.storage.local.set(patch);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.queueMode) state.queueMode = !!changes.queueMode.newValue;
    if (changes.queue) state.queue = changes.queue.newValue || [];
    if (changes.archives) state.archives = changes.archives.newValue || {};
    refresh();
  });

  // ---------- queue logic ----------

  function toggle(video) {
    const day = today();
    const archives = { ...state.archives };
    let todayList = [...(archives[day] || [])];
    let queue;

    if (state.queue.some((v) => v.id === video.id)) {
      queue = state.queue.filter((v) => v.id !== video.id);
      todayList = todayList.filter((v) => v.id !== video.id);
      toast(`Removed · ${video.title}`);
    } else {
      const item = { id: video.id, title: video.title, addedAt: Date.now() };
      queue = [...state.queue, item];
      if (!todayList.some((v) => v.id === item.id)) todayList.push(item);
      toast(`Queued #${queue.length} · ${video.title}`);
    }

    if (todayList.length) archives[day] = todayList;
    else delete archives[day];

    state.queue = queue;
    state.archives = archives;
    save({ queue, archives });
    refresh();
  }

  function removeAt(id) {
    const v = state.queue.find((x) => x.id === id);
    if (v) toggle(v);
  }

  function play(list) {
    if (!list.length) return;
    if (list.length > PLAY_LIMIT)
      toast(`Playing the first ${PLAY_LIMIT} of ${list.length} (YouTube's limit)`);
    location.assign(watchUrl(list.map((v) => v.id)));
  }

  async function copy(list, label) {
    const text = list.map((v) => `https://www.youtube.com/watch?v=${v.id}  ${v.title}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${list.length} links${label ? ` · ${label}` : ""}`);
    } catch {
      toast("Clipboard blocked by the browser");
    }
  }

  // ---------- click capture ----------
  // Capture phase on window runs before YouTube's own navigation handlers.
  // Ctrl/Cmd/Shift/middle clicks pass through so "open in new tab" still works.

  window.addEventListener(
    "click",
    (e) => {
      if (!state.queueMode || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const path = e.composedPath();
      if (path.includes(host)) return;
      const link = path.find((n) => n instanceof HTMLAnchorElement && n.href);
      if (!link) return;
      const id = idFromHref(link.href);
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const card = link.closest(CARD) || link;
      toggle({ id, title: titleOf(card, link) });
    },
    true
  );

  // ---------- page marking ----------

  const pageStyle = document.createElement("style");
  pageStyle.textContent = `
    html.ytq-on a[href*="/watch?v="], html.ytq-on a[href*="/shorts/"] { cursor: copy !important; }
    [data-ytq] { outline: 3px solid #ff0033 !important; outline-offset: 3px; border-radius: 12px; position: relative; }
    [data-ytq]::after {
      content: "QUEUED " attr(data-ytq-n);
      position: absolute; top: 8px; left: 8px; z-index: 50; pointer-events: none;
      background: #ff0033; color: #fff; padding: 4px 7px; border-radius: 6px;
      font: 700 11px/1 Roboto, Arial, sans-serif; letter-spacing: .05em;
      box-shadow: 0 2px 8px rgba(0,0,0,.5);
    }`;
  document.documentElement.appendChild(pageStyle);

  // YouTube recycles card elements for different videos, so marks are
  // recomputed from the live links every pass instead of trusted.
  function mark() {
    document.documentElement.classList.toggle("ytq-on", state.queueMode);
    const pos = new Map(state.queue.map((v, i) => [v.id, i + 1]));
    const want = new Map();
    if (pos.size) {
      for (const a of document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]')) {
        const id = idFromHref(a.href);
        if (!id || !pos.has(id)) continue;
        const card = a.closest(CARD);
        if (card && !want.has(card)) want.set(card, id);
      }
    }
    for (const el of document.querySelectorAll("[data-ytq]")) {
      if (!want.has(el)) {
        el.removeAttribute("data-ytq");
        el.removeAttribute("data-ytq-n");
      }
    }
    for (const [card, id] of want) {
      if (card.dataset.ytq !== id) card.dataset.ytq = id;
      const n = `#${pos.get(id)}`;
      if (card.dataset.ytqN !== n) card.dataset.ytqN = n;
    }
  }

  let markTimer = 0;
  const scheduleMark = () => {
    if (markTimer) return;
    markTimer = setTimeout(() => {
      markTimer = 0;
      mark();
    }, 400);
  };
  new MutationObserver(() => {
    if (state.queue.length) scheduleMark();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", scheduleMark);

  // ---------- floating UI (shadow DOM keeps YouTube's CSS out) ----------

  const host = document.createElement("div");
  host.id = "ytq-root";
  const root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  const css = document.createElement("style");
  css.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Roboto, "Segoe UI", Arial, sans-serif; }
    .wrap { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
    .pill { display: flex; border-radius: 999px; overflow: hidden; background: #09090b; border: 1px solid #27272a; box-shadow: 0 8px 30px rgba(0,0,0,.55); }
    .pill button { all: unset; cursor: pointer; color: #e4e4e7; font-size: 13px; font-weight: 600; padding: 10px 14px; display: flex; align-items: center; gap: 8px; }
    .pill button:hover { background: #18181b; }
    .pill button:focus-visible { outline: 2px solid #ff0033; outline-offset: -2px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #52525b; }
    .on .dot { background: #ff0033; box-shadow: 0 0 0 4px rgba(255,0,51,.25); }
    .on .mode { color: #fff; }
    .count { border-left: 1px solid #27272a; min-width: 44px; justify-content: center; }
    .on .count { background: #ff0033; color: #fff; border-left-color: #ff0033; }
    .on .count:hover { background: #e6002e; }
    .panel { width: 360px; max-height: min(70vh, 560px); display: flex; flex-direction: column; background: #09090b; color: #e4e4e7; border: 1px solid #27272a; border-radius: 16px; box-shadow: 0 16px 50px rgba(0,0,0,.6); overflow: hidden; }
    .head { padding: 14px 16px 10px; display: flex; justify-content: space-between; align-items: baseline; }
    .head b { font-size: 15px; color: #fff; }
    .head span { font-size: 12px; color: #a1a1aa; }
    .list { overflow-y: auto; padding: 0 8px; flex: 1; }
    .item { display: flex; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 10px; }
    .item:hover { background: #18181b; }
    .item img { width: 64px; height: 36px; object-fit: cover; border-radius: 6px; flex: none; background: #18181b; }
    .item a { color: #e4e4e7; text-decoration: none; font-size: 12.5px; line-height: 1.3; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .item a:hover { color: #fff; }
    .x { all: unset; cursor: pointer; color: #71717a; font-size: 18px; width: 24px; text-align: center; border-radius: 6px; }
    .x:hover { color: #fff; background: #ff0033; }
    .empty { color: #a1a1aa; font-size: 13px; padding: 8px 8px 14px; line-height: 1.5; }
    .bar { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #27272a; }
    .btn { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 600; padding: 8px 12px; border-radius: 999px; background: #18181b; color: #e4e4e7; border: 1px solid #27272a; }
    .btn:hover { background: #27272a; color: #fff; }
    .btn.primary { background: #ff0033; border-color: #ff0033; color: #fff; }
    .btn.primary:hover { background: #e6002e; }
    .btn:disabled { opacity: .4; cursor: default; }
    .days { border-top: 1px solid #27272a; padding: 10px 16px 14px; max-height: 170px; overflow-y: auto; }
    .days h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #a1a1aa; font-weight: 700; }
    .day { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12.5px; }
    .day span { flex: 1; color: #e4e4e7; font-variant-numeric: tabular-nums; }
    .day small { color: #71717a; }
    .day .btn { padding: 5px 10px; font-size: 11.5px; }
    .toast { background: #09090b; color: #fff; border: 1px solid #ff0033; border-radius: 10px; padding: 9px 13px; font-size: 12.5px; max-width: 360px; box-shadow: 0 8px 30px rgba(0,0,0,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `;
  root.appendChild(css);

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  // Small element builder. Text always goes through textContent, never
  // innerHTML: video titles are untrusted and YouTube enforces Trusted Types.
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid) el.append(kid);
    return el;
  }

  let toastEl = null;
  let toastTimer = 0;
  function toast(msg) {
    clearTimeout(toastTimer);
    toastEl?.remove();
    toastEl = h("div", { class: "toast", role: "status", text: msg });
    wrap.prepend(toastEl);
    toastTimer = setTimeout(() => toastEl?.remove(), 2200);
  }

  function render() {
    for (const el of [...wrap.children]) if (el !== toastEl) el.remove();
    const q = state.queue;

    if (state.panelOpen) {
      const days = Object.keys(state.archives).sort().reverse();
      wrap.append(
        h(
          "div",
          { class: "panel", role: "dialog", "aria-label": "Queue" },
          h("div", { class: "head" },
            h("b", { text: `Queue (${q.length})` }),
            h("span", { text: state.queueMode ? "Click videos to add or remove" : "Queue Mode is off" })
          ),
          h("div", { class: "list" },
            q.length
              ? q.map((v) =>
                  h("div", { class: "item" },
                    h("img", { src: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, alt: "", loading: "lazy" }),
                    h("a", { href: `https://www.youtube.com/watch?v=${v.id}`, title: v.title, text: v.title }),
                    h("button", { class: "x", title: "Remove", "aria-label": `Remove ${v.title}`, text: "×", onclick: () => removeAt(v.id) })
                  )
                )
              : h("div", { class: "empty", text: "Nothing queued yet. Turn on Queue Mode, then click any video thumbnail or title." })
          ),
          h("div", { class: "bar" },
            h("button", { class: "btn primary", disabled: !q.length, text: "▶ Play all", onclick: () => play(q) }),
            h("button", { class: "btn", disabled: !q.length, text: "Copy links", onclick: () => copy(q) }),
            h("button", {
              class: "btn",
              disabled: !q.length,
              text: "Clear",
              onclick: () => {
                state.queue = [];
                save({ queue: [] });
                toast(`Queue cleared · today's playlist (${today()}) kept`);
                refresh();
              },
            })
          ),
          days.length
            ? h("div", { class: "days" },
                h("h4", { text: "Daily playlists" }),
                days.map((d) =>
                  h("div", { class: "day" },
                    h("span", { text: d }),
                    h("small", { text: `${state.archives[d].length} videos` }),
                    h("button", { class: "btn", text: "Play", onclick: () => play(state.archives[d]) }),
                    h("button", { class: "btn", text: "Copy", onclick: () => copy(state.archives[d], d) })
                  )
                )
              )
            : null
        )
      );
    }

    wrap.append(
      h("div", { class: `pill${state.queueMode ? " on" : ""}` },
        h("button", {
          class: "mode",
          title: "Toggle Queue Mode (Alt+Q)",
          "aria-pressed": String(state.queueMode),
          onclick: () => save({ queueMode: !state.queueMode }),
        },
          h("i", { class: "dot" }),
          h("span", { text: state.queueMode ? "Queue Mode ON" : "Queue Mode" })
        ),
        h("button", {
          class: "count",
          title: "Show queue",
          "aria-expanded": String(state.panelOpen),
          text: String(q.length),
          onclick: () => {
            state.panelOpen = !state.panelOpen;
            render();
          },
        })
      )
    );
  }

  function refresh() {
    render();
    mark();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.panelOpen) {
      state.panelOpen = false;
      render();
    }
  });

  chrome.storage.local.get({ queueMode: false, queue: [], archives: {} }).then((s) => {
    Object.assign(state, s);
    refresh();
  });
})();
