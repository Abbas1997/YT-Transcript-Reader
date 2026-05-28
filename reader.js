let currentVideoId = null;
let saveNoteTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
    });
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function highlight(text, query) {
    if (!query) return escHtml(text);
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escHtml(text).replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
}

function wordCount(data) {
    const all = (data.transcript || []).map((l) => l.text).join(" ");
    const words = all.trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.ceil(words / 238);
    return `${words.toLocaleString()} words · ~${mins} min read`;
}

// Convert "1:23" or "1:23:45" to total seconds for YouTube URL
function timestampToSeconds(ts) {
    if (!ts) return 0;
    const parts = ts.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function attachProgressBar() {
    const col = document.getElementById("transcript-col");
    const bar = document.getElementById("progress-bar");
    col.addEventListener("scroll", () => {
        const max = col.scrollHeight - col.clientHeight;
        bar.style.width = max > 0 ? (col.scrollTop / max) * 100 + "%" : "0%";
    });
}

// ── Chapter nav ───────────────────────────────────────────────────────────────

function buildNavPanel(data) {
    const navCol = document.getElementById("nav-col");
    const navList = document.getElementById("nav-list");
    navList.innerHTML = "";

    const chapters = (data.paragraphs || [])
        .filter((lines) => lines.length === 1 && lines[0].type === "chapter");

    if (!chapters.length) {
        navCol.classList.add("hidden");
        return;
    }

    navCol.classList.remove("hidden");

    chapters.forEach((lines) => {
        const text = lines[0].text;
        // Strip "Chapter N: " prefix for brevity in the nav
        const label = text.replace(/^Chapter\s+\d+:\s*/i, "");

        const li = document.createElement("li");
        li.textContent = label;
        li.title = text;
        li.onclick = () => scrollToChapter(text);
        navList.appendChild(li);
    });
}

function scrollToChapter(text) {
    const headings = document.querySelectorAll(".chapter-heading");
    for (const h of headings) {
        if (h.dataset.chapterText === text) {
            h.scrollIntoView({ behavior: "smooth", block: "start" });
            // Briefly highlight active item in nav
            highlightNavItem(text);
            break;
        }
    }
}

function highlightNavItem(text) {
    document.querySelectorAll("#nav-list li").forEach((li) => {
        li.classList.toggle(
            "nav-active",
            li.title === text || text.endsWith(li.title)
        );
    });
}

// Keep nav item highlighted based on scroll position
function attachNavScrollSpy() {
    const col = document.getElementById("transcript-col");
    col.addEventListener("scroll", () => {
        const headings = [...document.querySelectorAll(".chapter-heading")];
        if (!headings.length) return;

        // Find the last heading that has scrolled past the top
        const scrollTop = col.scrollTop + 80;
        let active = null;
        for (const h of headings) {
            if (h.offsetTop <= scrollTop) active = h;
        }
        if (active) highlightNavItem(active.dataset.chapterText || "");
    });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

async function renderSidebar(activeId, query = "") {
    const transcripts = await Storage.getAll();
    const list = document.getElementById("sidebar-list");
    const listSplash = document.getElementById("sidebar-list-splash");
    list.innerHTML = "";
    listSplash.innerHTML = "";

    const filtered = query
        ? transcripts.filter(t => t.title.toLowerCase().includes(query.toLowerCase()))
        : transcripts;

    const renderItem = (t, container) => {
        const li = document.createElement("li");
        if (t.videoId === activeId) li.classList.add("active");
        li.innerHTML = `
          <div class="sl-title" title="${escHtml(t.title)}">${highlight(t.title, query)}</div>
          <div class="sl-date">${formatDate(t.savedAt)}</div>
        `;
        li.onclick = () => loadTranscript(t.videoId);
        container.appendChild(li);
    };

    if (activeId) {
        filtered.forEach(t => renderItem(t, list));
    } else {
        filtered.forEach(t => renderItem(t, listSplash));
    }
}

// ── Transcript rendering ──────────────────────────────────────────────────────

function renderTranscript(data, searchQuery = "") {
    const body = document.getElementById("transcript-body");
    body.innerHTML = "";

    const paragraphs = data.paragraphs || [data.transcript];
    let firstVisible = true;

    console.log(paragraphs[0])

    paragraphs.forEach((lines, i) => {
        const isChapter = lines.length === 1 && lines[0].type === "chapter";
        const paraText = lines.map((l) => l.text).join(" ");
        const firstTime = lines[0]?.time || "";
        //console.log(firstTime)
        const matches =
            !searchQuery ||
            paraText.toLowerCase().includes(searchQuery.toLowerCase());

        if (isChapter) {
            const h = document.createElement("h2");
            h.className = "chapter-heading" + (matches ? "" : " hidden-para");
            h.style.animationDelay = Math.min(i * 25, 500) + "ms";
            h.dataset.chapterText = paraText;
            h.innerHTML = highlight(paraText, searchQuery);
            body.appendChild(h);
            return;
        }

        const p = document.createElement("p");
        p.className = "para" + (matches ? "" : " hidden-para");

        if (matches && firstVisible && !searchQuery) {
            p.classList.add("drop-cap");
            firstVisible = false;
        }

        p.style.animationDelay = Math.min(i * 25, 500) + "ms";

        // Timestamp as a clickable link into the video
        let timeSpan = "";
        if (firstTime && data.url) {
            const secs = timestampToSeconds(firstTime);
            const url = `${data.url.split("&t=")[0]}&t=${secs}s`;
            timeSpan = `<a class="ts" href="${url}" target="_blank" rel="noopener" title="Open at ${firstTime}">${escHtml(firstTime)}</a>`;
        } else if (firstTime) {
            timeSpan = `<span class="ts">${escHtml(firstTime)}</span>`;
        }

        p.innerHTML = timeSpan + highlight(paraText, searchQuery);
        body.appendChild(p);
    });

    if (
        searchQuery &&
        body.querySelectorAll(".para:not(.hidden-para), .chapter-heading:not(.hidden-para)").length === 0
    ) {
        const msg = document.createElement("p");
        msg.className = "search-empty";
        msg.textContent = `No results for "${searchQuery}"`;
        body.appendChild(msg);
    }

    document.getElementById("transcript-col").scrollTop = 0;
    document.getElementById("progress-bar").style.width = "0%";
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadTranscript(videoId) {

    currentVideoId = videoId;
    const data = await Storage.get(videoId);
    if (!data) return;

    const url = new URL(window.location.href);
    url.searchParams.set("v", videoId);
    window.history.replaceState(null, "", url);

    // Header
    const link = document.getElementById("reader-title-link");
    link.textContent = data.title;
    link.href = data.url;
    document.getElementById("word-count").textContent = wordCount(data);

    // Notes
    document.getElementById("notes-area").value = data.note || "";
    document.getElementById("notes-status").textContent = "";

    
    // Render
    renderTranscript(data, document.getElementById("search-bar").value);
    buildNavPanel(data);
    
    // Font
    const savedFont = data.font || "default";
    document.getElementById("font-select").value = savedFont;
    if (savedFont === "default") {
        document.getElementById("transcript-body").style.fontFamily = "";
        document.getElementById("reader-title-link").style.fontFamily = "";
    } else {
        loadFont(savedFont);
        const fontName = ARABIC_FONTS[savedFont].name;
        document.getElementById("transcript-body").style.fontFamily = `'${fontName}', serif`;
        document.getElementById("reader-title-link").style.fontFamily = `'${fontName}', serif`;
        document.getElementById("transcript-body").querySelectorAll("p, h2").forEach(el => el.style.fontFamily = `'${fontName}', serif`);
    }
    // Show app
    document.getElementById("no-selection").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    await renderSidebar(videoId);
}

// ── Controls ──────────────────────────────────────────────────────────────────

document.getElementById("search-bar").addEventListener("input", (e) => {
    if (!currentVideoId) return;
    Storage.get(currentVideoId).then((data) => {
        if (data) renderTranscript(data, e.target.value);
    });
});

document.getElementById("copy-btn").addEventListener("click", async () => {
    if (!currentVideoId) return;
    const data = await Storage.get(currentVideoId);
    if (!data) return;
    const text = data.transcript
        .map((l) => (l.time ? `[${l.time}] ` : "") + l.text)
        .join("\n");
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById("copy-btn");
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1800);
    });
});

document.getElementById("delete-btn").addEventListener("click", async () => {
    if (!currentVideoId) return;
    if (!confirm("Delete this transcript?")) return;
    await Storage.delete(currentVideoId);
    currentVideoId = null;
    document.getElementById("app").classList.add("hidden");
    document.getElementById("no-selection").classList.remove("hidden");
    document.getElementById("nav-col").classList.add("hidden");
    renderSidebar(null);
});

document.getElementById("notes-area").addEventListener("input", () => {
    const status = document.getElementById("notes-status");
    status.textContent = "Saving…";
    clearTimeout(saveNoteTimer);
    saveNoteTimer = setTimeout(async () => {
        if (!currentVideoId) return;
        await Storage.saveNote(
            currentVideoId,
            document.getElementById("notes-area").value
        );
        status.textContent = "Saved";
        setTimeout(() => (status.textContent = ""), 1500);
    }, 800);
});

document.getElementById("rtl-btn").addEventListener("click", () => {
  const body = document.getElementById("transcript-body");
  const isRtl = body.dir === "rtl";
  body.dir = isRtl ? "ltr" : "rtl";
  const btn = document.getElementById("rtl-btn");
  btn.textContent = isRtl ? "RTL" : "LTR";
  btn.classList.toggle("active", !isRtl);
});

// ── Init ──────────────────────────────────────────────────────────────────────

attachProgressBar();
attachNavScrollSpy();

document.getElementById("home-btn").addEventListener("click", () => {
    currentVideoId = null;
    document.getElementById("app").classList.add("hidden");
    document.getElementById("no-selection").classList.remove("hidden");
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.history.replaceState(null, "", url);
    renderSidebar(null);
});

document.getElementById("toggle-sidebars-btn").addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    const navCol = document.getElementById("nav-col");
    const notesCol = document.getElementById("notes-col");
    const hidden = sidebar.classList.toggle("sidebars-hidden");
    if (!navCol.classList.contains("hidden")) {
        navCol.classList.toggle("sidebars-hidden");
    }
    notesCol.classList.toggle("sidebars-hidden");
    document.getElementById("toggle-sidebars-btn").classList.toggle("active", hidden);
});


const ARABIC_FONTS = {
  noto:         { name: "Noto Naskh Arabic",  url: "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500&display=swap" },
  noto_sans:    { name: "Noto Sans Arabic",    url: "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500&display=swap" },
  scheherazade: { name: "Scheherazade New",    url: "https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap" },
  amiri:        { name: "Amiri",               url: "https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap" },
};

const loadedFonts = new Set();

function loadFont(key) {
  if (loadedFonts.has(key)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = ARABIC_FONTS[key].url;
  document.head.appendChild(link);
  loadedFonts.add(key);
}

document.getElementById("font-select").addEventListener("change", (e) => {
  const body = document.getElementById("transcript-body");
  const titleLink = document.getElementById("reader-title-link");
  const key = e.target.value;

  if (key === "default") {
    body.style.fontFamily = "";
    titleLink.style.fontFamily = "";
    body.querySelectorAll("p, h2").forEach(el => el.style.fontFamily = "");
  } else {
    loadFont(key);
    const fontName = ARABIC_FONTS[key].name;
    body.style.fontFamily = `'${fontName}', serif`;
    titleLink.style.fontFamily = `'${fontName}', serif`;
    body.querySelectorAll("p, h2").forEach(el => el.style.fontFamily = `'${fontName}', serif`);
  }

  if (currentVideoId) {
    Storage.saveFont(currentVideoId, key);
  }
});

document.getElementById("sidebar-search").addEventListener("input", (e) => {
    renderSidebar(currentVideoId, e.target.value);
});

document.getElementById("sidebar-search-splash").addEventListener("input", (e) => {
    renderSidebar(null, e.target.value);
});

(async () => {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("v");
    // Always render sidebar first so it's populated whether or not a video is selected
    await renderSidebar(videoId || null);
    if (videoId) await loadTranscript(videoId);
})();


function openReview() {
    let id = chrome.runtime.id
    if (id != null) {
        let url = `https://chromewebstore.google.com/detail/${id}`
        window.open(url, '_blank')    }
}

document.getElementById('review-btn').addEventListener('click', openReview)

