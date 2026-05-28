// storage.js — loaded in popup and reader pages
const Storage = {
    async getAll() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                const transcripts = Object.entries(items)
                    .filter(([k]) => k.startsWith("transcript_"))
                    .map(([, v]) => v)
                    .sort((a, b) => b.savedAt - a.savedAt);
                resolve(transcripts);
            });
        });
    },

    async get(videoId) {
        return new Promise((resolve) => {
            chrome.storage.local.get(`transcript_${videoId}`, (items) => {
                resolve(items[`transcript_${videoId}`] || null);
            });
        });
    },

    async save(data) {
        // data: { videoId, title, url, transcript, savedAt }
        return new Promise((resolve) => {
            chrome.storage.local.set({ [`transcript_${data.videoId}`]: data }, resolve);
        });
    },

    async saveNote(videoId, note) {
        const existing = await this.get(videoId);
        if (existing) {
            existing.note = note;
            await this.save(existing);
        }
    },

    async saveFont(videoId, fontKey) {
        const existing = await this.get(videoId);
        if (existing) {
            existing.font = fontKey;
            await this.save(existing);
        }
    },

    async delete(videoId) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(`transcript_${videoId}`, resolve);
        });
    },
};