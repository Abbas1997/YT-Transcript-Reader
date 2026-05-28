function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function openReader(videoId) {
  const url = chrome.runtime.getURL(`reader.html${videoId ? "?v=" + videoId : ""}`);
  chrome.tabs.create({ url });
  window.close();
}

async function render() {
  const transcripts = await Storage.getAll();
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");

  list.innerHTML = "";

  if (!transcripts.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  transcripts.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="item-info">
        <div class="item-title" title="${t.title}">${t.title}</div>
        <div class="item-date">${formatDate(t.savedAt)}</div>
      </div>
      <button class="item-del" title="Delete">✕</button>
    `;
    li.querySelector(".item-info").onclick = () => openReader(t.videoId);
    li.querySelector(".item-del").onclick = async (e) => {
      e.stopPropagation();
      await Storage.delete(t.videoId);
      render();
    };
    list.appendChild(li);
  });
}

document.getElementById("open-reader").onclick = () => openReader(null);
render();