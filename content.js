// content.js — injected into youtube.com/watch pages


(function () {
    "use strict";

    let buttonInjected = false;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function getVideoId() {
        const params = new URLSearchParams(window.location.search);
        return params.get("v");
    }

    function getVideoTitle() {
        const el =
            document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
            document.querySelector("h1.title") ||
            document.querySelector("ytd-watch-metadata h1");
        return el ? el.textContent.trim() : document.title.replace(" - YouTube", "").trim();
    }

    // ── Transcript Extraction ──────────────────────────────────────────────────

    async function waitForElement(selector, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for ${selector}`));
            }, timeout);
        });
    }

    async function openTranscriptPanel() {
        // Step 1: Expand description — try multiple selectors and wait for one
        const expandSelectors = [
            "tp-yt-paper-button#expand",
            "ytd-text-inline-expander tp-yt-paper-button",
            "#description-inline-expander tp-yt-paper-button",
            "#expand",
        ];
        for (const sel of expandSelectors) {
            const el = document.querySelector(sel);
            if (el) { el.click(); break; }
        }

        // Step 2: Wait for the transcript button to appear, then click it
        // Give it up to 6 seconds to show up in the DOM
        const transcriptBtn = await waitForTranscriptButton(6000);
        transcriptBtn.click();
    }

    function waitForTranscriptButton(timeout = 6000) {
        return new Promise((resolve, reject) => {
            function findBtn() {
                // Match by text content — covers all known label variants
                const candidates = document.querySelectorAll(
                    "button, tp-yt-paper-button, yt-button-shape button, yt-button-renderer button"
                );
                for (const btn of candidates) {
                    const text = (btn.textContent || btn.innerText || "").trim().toLowerCase();
                    const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
                    if (
                        text === "show transcript" ||
                        text === "transcript" ||
                        text === "open transcript" ||
                        text === "view transcript" ||
                        aria === "show transcript" ||
                        aria === "transcript" ||
                        aria === "open transcript"
                    ) {
                        return btn;
                    }
                }
                return null;
            }

            // Check immediately first
            const immediate = findBtn();
            if (immediate) return resolve(immediate);

            const observer = new MutationObserver(() => {
                const btn = findBtn();
                if (btn) {
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(btn);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error("Could not find the 'Show transcript' button. This video may not have captions."));
            }, timeout);
        });
    }

    function getSegments() {
        let segs = document.querySelectorAll("transcript-segment-view-model");
        if (segs.length > 0) return segs;

        segs = document.querySelectorAll("ytd-transcript-segment-renderer");
        if (segs.length > 0) return segs;

        const panel = document.querySelector(
            "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']"
        );
        if (panel) {
            const root = panel.shadowRoot || panel;
            segs = root.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model");
            if (segs.length > 0) return segs;
        }

        segs = document.querySelectorAll(".segment-text");
        if (segs.length > 0) return segs;
        console.log('getSegments returned nothing')
        return null;
    }

    function waitForSegments(timeout = 15000) {
        return new Promise((resolve, reject) => {
            // function getSegments() {
            //     let segs = document.querySelectorAll("transcript-segment-view-model");
            //     if (segs.length > 0) return segs;

            //     segs = document.querySelectorAll("ytd-transcript-segment-renderer");
            //     if (segs.length > 0) return segs;

            //     const panel = document.querySelector(
            //         "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']"
            //     );
            //     if (panel) {
            //         const root = panel.shadowRoot || panel;
            //         segs = root.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model");
            //         if (segs.length > 0) return segs;
            //     }

            //     segs = document.querySelectorAll(".segment-text");
            //     if (segs.length > 0) return segs;
            //     console.log('getSegments returned nothing')
            //     return null;
            // }

            // Check immediately
            console.log('waitForSegments')
            const existing = getSegments();
            if (existing) return resolve(existing);

            // Poll every 300ms — necessary because MutationObserver can't
            // see inside YouTube's Shady DOM shadow roots
            const interval = setInterval(() => {
                const segs = getSegments();
                if (segs) {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(segs);
                }
            }, 300);

            const timer = setTimeout(() => {
                clearInterval(interval);
                reject(new Error("Transcript segments not found. The video may not have captions."));
            }, timeout);
        });
    }

    async function extractTranscript(segmentsPromise) {
        const segments = await segmentsPromise;
        //console.log(segments[0])

        const panel =
            document.querySelector("ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']") ||
            document.querySelector("ytd-engagement-panel-section-list-renderer");

        const root = panel ? (panel.shadowRoot || panel) : document;

        // Build a list of all items (chapters + segments) sorted by DOM order
        const items = [];

        if(document.querySelector('.ytSectionListRendererContents')) {            
            let classText = '.ytAttributedStringHost.ytAttributedStringLinkInheritColor'
            let classChapter = '.ytwTranscriptSegmentViewModelTimestamp'
            let classTime = '.ytwTimelineChapterViewModelTitle'
            let elems = document.querySelector('.ytSectionListRendererContents').querySelectorAll(classText + ' , ' + classChapter + ' , ' + classTime)
            //console.log(elems.length)
    
            let currentTimeStamp
            for (let i = 0; i < elems.length; i++) {
                if (elems[i].classList.contains('ytAttributedStringHost')) {
                    let text = elems[i].innerText.trim()
                    items.push({ time: currentTimeStamp, text, type: "line" });
                    //console.log({ currentTimeStamp, text, type: "line" })
                }
                if (elems[i].classList.contains('ytwTranscriptSegmentViewModelTimestamp')) {
                    currentTimeStamp = elems[i].innerText.trim()
                    //console.log(currentTimeStamp)
                }
                if (elems[i].classList.contains('ytwTimelineChapterViewModelTitle')) {
                    let text = elems[i].innerText.trim()
                    items.push({ time: "currentTimeStamp", text, type: "chapter" });
                    //console.log({ currentTimeStamp, text, type: "line" })
                }
            }
            return items
        }

        if (document.querySelector('#segments-container')) {
            let elems = document.querySelector('#segments-container').children
            let currentTimeStamp
            for (let i = 0; i < elems.length; i++) {
                if (elems[i].tagName.toLowerCase() == 'ytd-transcript-section-header-renderer') {
                    let text = elems[i].innerText.trim()
                    items.push({ time: "", text, type: "chapter" });
                }
                if (elems[i].querySelector('.segment-timestamp')) {
                    currentTimeStamp = elems[i].querySelector('.segment-timestamp').innerText.trim()
                }
                if (elems[i].querySelector('.segment-text')) {
                    let text = elems[i].querySelector('.segment-text').innerText.trim()
                    items.push({ time: currentTimeStamp, text, type: "line" });
                }
            }
            return items
        }



        return items

        // Collect segments with their DOM node
        // segments.forEach((seg) => {
        //     let time = "";
        //     let text = "";

        //     if (seg.tagName.toLowerCase() === "transcript-segment-view-model") {
        //         const timeEl = seg.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
        //         const textEl = seg.querySelector(".ytAttributedStringHost");
        //         time = timeEl ? timeEl.textContent.trim() : "";
        //         text = textEl ? textEl.textContent.trim() : "";
        //     } else {
        //         const timeEl = seg.querySelector(".segment-timestamp, [class*='timestamp']");
        //         const textEl = seg.querySelector(".segment-text, yt-formatted-string, .ytAttributedStringHost");
        //         time = timeEl ? timeEl.textContent.trim() : "";
        //         text = textEl ? textEl.textContent.trim() : seg.textContent.trim();
        //     }

        //     if (text) items.push({ node: seg, time, text, type: "line" });
        // });

        // // Collect chapter headings with their DOM node
        // //console.log(root)
        // root.querySelectorAll("h3.ytwTimelineChapterViewModelTitle").forEach((el) => {
        //     //const text = el.textContent.trim();
        //     // Optional: strip "Chapter 1: " prefix
        //     const text = el.textContent.trim().replace(/^Chapter\s+\d+:\s*/i, "");
        //     if (text) items.push({ node: el, time: "", text, type: "chapter" });
        // });

        // // Sort everything by DOM position
        // items.sort((a, b) => {
        //     const pos = a.node.compareDocumentPosition(b.node);
        //     if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        //     if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        //     return 0;
        // });

        // // Strip nodes before returning, deduplicate lines
        // const seen = new Set();
        // return items
        //     .filter(({ text, type }) => {
        //         if (type === "chapter") return true;
        //         if (seen.has(text)) return false;
        //         seen.add(text);
        //         return true;
        //     })
        //     .map(({ time, text, type }) => ({ time, text, type }));
    }

    function buildParagraphs(lines) {
        const paragraphs = [];
        let current = [];

        lines.forEach((line) => {
            if (line.type === "chapter") {
                // Flush any accumulated lines first
                if (current.length) {
                    paragraphs.push(current);
                    current = [];
                }
                // Push chapter as its own single-item group
                paragraphs.push([{ ...line }]);
                return;
            }

            current.push(line);
            if (line.text.endsWith(".") || line.text.endsWith("?") || line.text.endsWith("!")) {
                paragraphs.push(current);
                current = [];
            }
        });

        if (current.length) paragraphs.push(current);
        return paragraphs;
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    // ── Main Button ────────────────────────────────────────────────────────────

    async function handleSaveTranscript(btn) {
        const videoId = getVideoId();
        if (!videoId) {
            showToast("Could not determine video ID.");
            return;
        }

        btn.disabled = true;
        const label = btn.querySelector("#yt-transcript-btn-label");
        if (label) label.textContent = "Loading…";
        else btn.textContent = "Loading…";

        try {
            // Start observing BEFORE clicking anything, so we don't miss
            // the segments appearing during the panel open animation
            console.log('clicked')
            const segmentsPromise = waitForSegments(15000);

            if (!getSegments()) {
                await openTranscriptPanel();
            }


            // Now wait for segments — observer was already running during the click
            const lines = await extractTranscript(segmentsPromise);

            if (!lines.length) throw new Error("No transcript lines found.");

            const paragraphs = buildParagraphs(lines);
            const title = getVideoTitle();

            const payload = {
                videoId,
                title,
                url: window.location.href,
                transcript: lines,
                paragraphs,
                savedAt: Date.now(),
                note: "",
            };

            chrome.runtime.sendMessage(
                { type: "STORAGE_SET", key: `transcript_${videoId}`, value: payload },
                () => {
                    if (label) label.textContent = "✓ Saved";
                    else btn.textContent = "✓ Saved";
                    btn.style.color = "#4ade80";
                    setTimeout(() => {
                        if (label) label.textContent = "Transcript";
                        else btn.textContent = "Transcript";
                        btn.style.color = "";
                        btn.disabled = false;
                    }, 2000);

                    const readerUrl = chrome.runtime.getURL(`reader.html?v=${videoId}`);
                    window.open(readerUrl, "_blank");
                }
            );
        } catch (err) {
            if (label) label.textContent = "Error";
            else btn.textContent = "Error";
            btn.style.color = "#f87171";
            console.error("[YT Transcript]", err);
            showToast(err);
            setTimeout(() => {
                if (label) label.textContent = "Transcript";
                else btn.textContent = "Transcript";
                btn.style.color = "";
                btn.disabled = false;
            }, 2500);
        }
    }

    function hasBannerNearby() {
        // Detect the promo/merch/offer banners YouTube places just below the like row.
        // Known selectors as of 2025:
        const bannerSelectors = [
            "ytd-merch-shelf-renderer",
            "ytd-product-carousel-renderer",
            "ytd-offer-module-renderer",
            "ytd-banner-promo-renderer",
            "ytd-statement-banner-renderer",
            "ytd-video-description-infocards-section-renderer",
            "#below-the-fold-curator",
            "ytd-ticket-shelf-renderer",
        ];
        return bannerSelectors.some((sel) => !!document.querySelector(sel));
    }

    function createTranscriptButton() {
        const btn = document.createElement("button");
        btn.id = "yt-transcript-ext-btn";
        btn.title = "Save & read transcript";

        Object.assign(btn.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "0 18px",
            height: "36px",
            borderRadius: "18px",
            border: "none",
            background: "#b85c38",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            letterSpacing: "0.01em",
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            position: "relative",   // ensures z-index works
            zIndex: "2147483647",   // max z-index, floats above any banner
        });

        btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
      <rect x="4" y="4" width="16" height="3" rx="1.5"/>
      <rect x="4" y="10" width="16" height="3" rx="1.5"/>
      <rect x="4" y="16" width="10" height="3" rx="1.5"/>
    </svg>
    <span id="yt-transcript-btn-label">Transcript</span>`;

        btn.onmouseenter = () => {
            btn.style.background = "#9e4c2e";
            btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.45)";
            btn.style.transform = "translateY(-1px)";
        };
        btn.onmouseleave = () => {
            btn.style.background = "#b85c38";
            btn.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
            btn.style.transform = "translateY(0)";
        };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();   // prevent banner links from receiving the click
            e.preventDefault();
            handleSaveTranscript(btn);
        });

        return btn;
    }

    function injectButton() {
        if (buttonInjected || document.getElementById("yt-transcript-ext-btn")) return;
        const btn = createTranscriptButton();

        const likeRow =
            document.querySelector("ytd-menu-renderer.ytd-watch-metadata")

        if (likeRow == null) {
            console.log('no like row')
            return
        };

        btn.style.marginLeft = "8px";
        //likeRow.appendChild(btn);
        likeRow.insertAdjacentElement("afterbegin", btn)
        buttonInjected = true;

    }

    // ── Navigation observer (YouTube is a SPA) ─────────────────────────────────

    function onPageChange() {
        buttonInjected = false;
        // Wait for the like row to render

        console.log('onPageChange')

        injectButton()

        if (!buttonInjected) {
            const observer = new MutationObserver(() => {
                if (window.location.pathname === "/watch") {
                    injectButton();
                    if (buttonInjected) {
                        observer.disconnect()
                    }
                }
    
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

    }

    // YouTube fires yt-navigate-finish on SPA navigation
    //console.log('script injected')
    window.addEventListener("yt-navigate-finish", onPageChange);
    new MutationObserver(() => onPageChange())
        .observe(document.querySelector("title"), { childList: true });

    // Initial load
    if (window.location.pathname === "/watch") {
        onPageChange();
        new MutationObserver(() => onPageChange())
        .observe(document.querySelector("title"), { childList: true });
    }

    function showToast(message, type = "error") {
        const existing = document.getElementById("yt-transcript-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "yt-transcript-toast";
        Object.assign(toast.style, {
            position: "fixed",
            bottom: "28px",
            left: "50%",
            transform: "translateX(-50%) translateY(12px)",
            background: type === "error" ? "#3a1a1a" : "#1a2e1a",
            color: type === "error" ? "#f87171" : "#86efac",
            border: `1px solid ${type === "error" ? "#7f1d1d" : "#166534"}`,
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "13px",
            fontFamily: "sans-serif",
            fontWeight: "500",
            zIndex: "99999",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            opacity: "0",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            maxWidth: "340px",
            textAlign: "center",
            lineHeight: "1.4",
        });
        toast.textContent = message //+ " Please let the developer know at haiderextensions97@gmail.com Some videos may not have a transcript.";
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(-50%) translateY(0)";
        });

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(8px)";
            setTimeout(() => toast.remove(), 300);
        }, 6000);
    }

})();