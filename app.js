const storageKey = "flight-reader-v1";
const settingsKey = "flight-reader-settings-v1";

const fileInput = document.querySelector("#fileInput");
const backupInput = document.querySelector("#backupInput");
const urlForm = document.querySelector("#urlForm");
const urlInput = document.querySelector("#urlInput");
const urlStatus = document.querySelector("#urlStatus");
const urlButton = document.querySelector("#urlButton");
const pasteForm = document.querySelector("#pasteForm");
const pasteTitle = document.querySelector("#pasteTitle");
const pasteText = document.querySelector("#pasteText");
const pasteStatus = document.querySelector("#pasteStatus");
const bookList = document.querySelector("#bookList");
const searchInput = document.querySelector("#searchInput");
const clearButton = document.querySelector("#clearButton");
const content = document.querySelector("#content");
const reader = document.querySelector(".reader");
const bookTitle = document.querySelector("#bookTitle");
const metaLine = document.querySelector("#metaLine");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const bookmarkText = document.querySelector("#bookmarkText");
const chapterControls = document.querySelector("#chapterControls");
const chapterSelect = document.querySelector("#chapterSelect");
const prevChapter = document.querySelector("#prevChapter");
const nextChapter = document.querySelector("#nextChapter");
const themeButton = document.querySelector("#themeButton");
const decreaseFont = document.querySelector("#decreaseFont");
const increaseFont = document.querySelector("#increaseFont");
const bookmarkButton = document.querySelector("#bookmarkButton");
const jumpBookmarkButton = document.querySelector("#jumpBookmarkButton");
const exportButton = document.querySelector("#exportButton");
const exportSidebarButton = document.querySelector("#exportSidebarButton");
const installButton = document.querySelector("#installButton");

let books = loadBooks().map(normalizeBook);
let settings = loadSettings();
let activeId = settings.activeId || books[0]?.id || null;
let deferredInstall = null;

persist();
applySettings();
renderLibrary();
openBook(activeId);

fileInput.addEventListener("change", async (event) => {
  const files = [...event.target.files];
  const chapters = [];
  const importedBackups = [];
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    if (isBackupFile(file)) {
      try {
        importedBackups.push(normalizeBackup(JSON.parse(await file.text())));
      } catch (error) {
        alert(`${file.name}: ${error.message || "Could not import that backup."}`);
      }
      continue;
    }

    chapters.push({
      title: file.name.replace(/\.(txt|md|html?|markdown)$/i, ""),
      type: file.type || "text/plain",
      text: await file.text(),
      progress: 0
    });
  }

  if (importedBackups.length) {
    books.unshift(...importedBackups);
  }

  if (chapters.length === 1) {
    books.unshift({
      id: crypto.randomUUID(),
      title: chapters[0].title,
      chapters,
      activeChapter: 0,
      progress: 0,
      addedAt: Date.now()
    });
  } else if (chapters.length > 1) {
    books.unshift({
      id: crypto.randomUUID(),
      title: `Imported chapters ${new Date().toLocaleDateString()}`,
      chapters,
      activeChapter: 0,
      progress: 0,
      addedAt: Date.now()
    });
  }

  activeId = importedBackups[0]?.id || books[0]?.id || null;
  persist();
  renderLibrary();
  openBook(activeId);
  fileInput.value = "";
});

backupInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());
    const importedBook = normalizeBackup(backup);
    books.unshift(importedBook);
    activeId = importedBook.id;
    persist();
    renderLibrary();
    openBook(activeId);
  } catch (error) {
    alert(error.message || "Could not import that backup.");
  } finally {
    backupInput.value = "";
  }
});

urlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setUrlStatus("Importing...", true);
  try {
    const book = await fetchBookFromUrl(url);
    books.unshift(book);
    activeId = book.id;
    urlInput.value = "";
    setUrlStatus("Imported. Save it before your flight and test airplane mode.", false);
    persist();
    renderLibrary();
    openBook(activeId);
  } catch (error) {
    setUrlStatus(error.message || "Could not import that URL.", false);
  }
});

pasteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = pasteTitle.value.trim();
  const text = pasteText.value.trim();

  if (!text) {
    pasteStatus.textContent = "Paste some readable text first.";
    return;
  }

  const chapters = splitChapters(text);
  const bookTitle = title || chapters[0]?.title || `Pasted chapters ${new Date().toLocaleDateString()}`;
  const book = {
    id: crypto.randomUUID(),
    title: bookTitle,
    chapters: chapters.map((chapter, index) => ({
      title: chapter.title || `${bookTitle} ${index + 1}`,
      type: "text/plain",
      text: chapter.text,
      progress: 0
    })),
    activeChapter: 0,
    progress: 0,
    addedAt: Date.now()
  };

  books.unshift(book);
  activeId = book.id;
  pasteTitle.value = "";
  pasteText.value = "";
  pasteStatus.textContent = "Saved to your offline shelf.";
  persist();
  renderLibrary();
  openBook(activeId);
});

searchInput.addEventListener("input", renderLibrary);

chapterSelect.addEventListener("change", () => {
  openChapter(Number(chapterSelect.value));
});

prevChapter.addEventListener("click", () => {
  const book = activeBook();
  if (!book) return;
  openChapter(Math.max(0, currentChapterIndex(book) - 1));
});

nextChapter.addEventListener("click", () => {
  const book = activeBook();
  if (!book) return;
  openChapter(Math.min(getChapters(book).length - 1, currentChapterIndex(book) + 1));
});

bookmarkButton.addEventListener("click", () => {
  saveBookmark();
});

jumpBookmarkButton.addEventListener("click", () => {
  jumpToBookmark();
});

clearButton.addEventListener("click", () => {
  if (!books.length || !confirm("Remove every imported book from this browser?")) return;
  books = [];
  activeId = null;
  persist();
  renderLibrary();
  openBook(null);
});

content.addEventListener("scroll", () => {
  const book = books.find((item) => item.id === activeId);
  if (!book) return;
  const chapter = currentChapter(book);
  const scrollable = content.scrollHeight - content.clientHeight;
  const progress = scrollable > 0 ? content.scrollTop / scrollable : 0;
  chapter.progress = progress;
  book.progress = totalProgress(book);
  updateReadingMeta(book);
  persist();
  renderLibrary(false);
});

themeButton.addEventListener("click", () => {
  settings.dark = !settings.dark;
  applySettings();
  persist(false);
});

decreaseFont.addEventListener("click", () => {
  settings.fontSize = Math.max(16, settings.fontSize - 1);
  applySettings();
  persist(false);
});

increaseFont.addEventListener("click", () => {
  settings.fontSize = Math.min(28, settings.fontSize + 1);
  applySettings();
  persist(false);
});

exportButton.addEventListener("click", () => {
  exportActiveBook();
});

exportSidebarButton.addEventListener("click", () => {
  exportActiveBook();
});

function exportActiveBook() {
  const book = activeBook();
  if (!book) return;
  exportBookBackup(book);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstall = event;
  installButton.classList.remove("hidden");
});

installButton.addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  installButton.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function renderLibrary(allowEmpty = true) {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = books.filter((book) => book.title.toLowerCase().includes(query));

  if (!filtered.length) {
    if (allowEmpty) {
      bookList.innerHTML = `<p class="empty">${books.length ? "No matching books." : "Your offline shelf is empty."}</p>`;
    }
    return;
  }

  bookList.innerHTML = filtered
    .map((book) => {
      const chapters = getChapters(book);
      const percent = Math.round(totalProgress(book) * 100);
      const mark = book.bookmark ? " - bookmarked" : "";
      return `
        <button class="book ${book.id === activeId ? "active" : ""}" type="button" data-id="${book.id}">
          <span class="book-title">${escapeHtml(book.title)}</span>
          <span class="book-progress">${chapters.length} chapter${chapters.length === 1 ? "" : "s"} - ${percent}% read${mark}</span>
        </button>
      `;
    })
    .join("");

  bookList.querySelectorAll(".book").forEach((button) => {
    button.addEventListener("click", () => {
      openBook(button.dataset.id);
      focusReaderOnSmallScreen();
    });
  });
}

function openBook(id) {
  const book = books.find((item) => item.id === id);
  activeId = book?.id || null;
  settings.activeId = activeId;

  if (!book) {
    bookTitle.textContent = "Import a legal novel file";
    metaLine.textContent = "Ready for takeoff";
    chapterControls.classList.add("hidden");
    bookmarkButton.disabled = true;
    jumpBookmarkButton.disabled = true;
    exportButton.disabled = true;
    exportSidebarButton.disabled = true;
    content.innerHTML = `
      <p>Import legally obtained novel files before boarding, then read without an internet connection.</p>
      <p>Good sources include ebook store exports, your own writing, public domain books, or files the author allows you to download.</p>
    `;
    progressBar.style.width = "0%";
    progressText.textContent = "0% read";
    bookmarkText.textContent = "No bookmark";
    persist(false);
    return;
  }

  renderChapterControls(book);
  const chapter = currentChapter(book);
  bookTitle.textContent = book.title;
  metaLine.textContent = chapter ? `${chapter.title} - Offline mode` : "Offline mode";
  bookmarkButton.disabled = false;
  jumpBookmarkButton.disabled = !book.bookmark;
  exportButton.disabled = false;
  exportSidebarButton.disabled = false;
  content.innerHTML = renderChapter(chapter || book);
  requestAnimationFrame(() => {
    const scrollable = content.scrollHeight - content.clientHeight;
    content.scrollTop = Math.round(scrollable * ((chapter?.progress || 0)));
    updateReadingMeta(book);
  });
  persist(false);
  renderLibrary(false);
}

function focusReaderOnSmallScreen() {
  if (window.matchMedia("(max-width: 560px)").matches) {
    reader.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openChapter(index) {
  const book = activeBook();
  if (!book) return;
  const chapters = getChapters(book);
  book.activeChapter = Math.max(0, Math.min(index, chapters.length - 1));
  currentChapter(book).progress = currentChapter(book).progress || 0;
  openBook(book.id);
}

function saveBookmark() {
  const book = activeBook();
  if (!book) return;
  const index = currentChapterIndex(book);
  const chapter = currentChapter(book);

  book.bookmark = {
    chapter: index,
    progress: chapter?.progress || 0,
    label: chapter?.title || `Chapter ${index + 1}`,
    savedAt: new Date().toISOString()
  };

  persist();
  updateReadingMeta(book);
  renderLibrary(false);
}

function jumpToBookmark() {
  const book = activeBook();
  if (!book?.bookmark) return;
  const chapters = getChapters(book);
  const index = Math.max(0, Math.min(book.bookmark.chapter || 0, chapters.length - 1));
  book.activeChapter = index;
  chapters[index].progress = book.bookmark.progress || 0;
  openBook(book.id);
}

function updateReadingMeta(book) {
  const total = Math.round(totalProgress(book) * 100);
  const index = currentChapterIndex(book);
  const chapter = currentChapter(book);
  const chapterProgress = Math.round((chapter?.progress || 0) * 100);
  progressBar.style.width = `${total}%`;
  progressText.textContent = `${total}% read - chapter ${index + 1}, ${chapterProgress}%`;

  if (book.bookmark) {
    const markChapter = Math.max(0, (book.bookmark.chapter || 0) + 1);
    const markProgress = Math.round((book.bookmark.progress || 0) * 100);
    bookmarkText.textContent = `Bookmark: chapter ${markChapter}, ${markProgress}%`;
    jumpBookmarkButton.disabled = false;
  } else {
    bookmarkText.textContent = "No bookmark";
    jumpBookmarkButton.disabled = true;
  }
}

function renderChapterControls(book) {
  const chapters = getChapters(book);
  chapterControls.classList.toggle("hidden", chapters.length <= 1);
  chapterSelect.innerHTML = chapters
    .map((chapter, index) => `<option value="${index}">${index + 1}. ${escapeHtml(chapter.title)}</option>`)
    .join("");
  const index = currentChapterIndex(book);
  chapterSelect.value = String(index);
  prevChapter.disabled = index <= 0;
  nextChapter.disabled = index >= chapters.length - 1;
}

function activeBook() {
  return books.find((item) => item.id === activeId);
}

function currentChapter(book) {
  return getChapters(book)[currentChapterIndex(book)];
}

function currentChapterIndex(book) {
  const chapters = getChapters(book);
  return Math.max(0, Math.min(book.activeChapter || 0, chapters.length - 1));
}

function getChapters(book) {
  if (Array.isArray(book.chapters) && book.chapters.length) return book.chapters;
  return [
    {
      title: book.title,
      type: book.type || "text/plain",
      text: book.text || "",
      progress: book.progress || 0
    }
  ];
}

function totalProgress(book) {
  const chapters = getChapters(book);
  if (!chapters.length) return 0;
  const index = currentChapterIndex(book);
  return Math.min(1, (index + (chapters[index]?.progress || 0)) / chapters.length);
}

function renderChapter(chapter) {
  if (looksLikeFlightReaderBackup(chapter.text || "")) {
    return `
      <p>This file is a Flight Reader backup, not a normal text chapter.</p>
      <p>Use Import backup or Import files again with the latest app version to restore it into the shelf.</p>
    `;
  }

  if (/html/i.test(chapter.type) || /<\/?[a-z][\s\S]*>/i.test((chapter.text || "").slice(0, 500))) {
    return sanitizeHtml(chapter.text || "");
  }

  const blocks = (chapter.text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
}

function splitChapters(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chapters = [];
  let current = null;
  const marker = /^(chapter|ep\.?|episode|\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48|\u0e1a\u0e17\u0e17\u0e35\u0e48)\s*[\w\d\u0e50-\u0e59]+.*$/i;

  for (const line of lines) {
    if (marker.test(line.trim())) {
      if (current?.text.trim()) chapters.push({ title: current.title, text: current.text.trim() });
      current = { title: line.trim(), text: "" };
      continue;
    }
    if (!current) current = { title: "", text: "" };
    current.text += `${line}\n`;
  }

  if (current?.text.trim()) chapters.push({ title: current.title, text: current.text.trim() });
  return chapters.length ? chapters : [{ title: "", text }];
}

async function fetchBookFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a full URL starting with http:// or https://.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http:// and https:// links are supported.");
  }

  const response = await fetch(parsed.href, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`The website returned ${response.status}. Download the file manually if you have access.`);
  }

  const contentType = response.headers.get("content-type") || "text/plain";
  if (!/text|html|markdown|xml|json/i.test(contentType)) {
    throw new Error("That URL does not look like a readable text or HTML file.");
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error("That page was empty.");
  }

  return {
    id: crypto.randomUUID(),
    title: titleFromUrl(parsed, text),
    chapters: [
      {
        title: titleFromUrl(parsed, text),
        type: contentType,
        text,
        progress: 0
      }
    ],
    activeChapter: 0,
    sourceUrl: parsed.href,
    progress: 0,
    addedAt: Date.now()
  };
}

function titleFromUrl(url, text) {
  const htmlTitle = text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
  if (htmlTitle) return decodeEntities(htmlTitle);

  const pathName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
  return pathName.replace(/\.(txt|md|html?|markdown)$/i, "") || url.hostname;
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script, iframe, object, embed, link, style, noscript, form, input, button")
    .forEach((node) => node.remove());

  removeReaderClutter(template);

  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || ["srcdoc", "style"].includes(attr.name)) node.removeAttribute(attr.name);
    });
  });

  return template.innerHTML;
}

function removeReaderClutter(template) {
  const clutterWords = [
    "ad",
    "ads",
    "advert",
    "advertise",
    "advertisement",
    "banner",
    "sponsor",
    "sponsored",
    "promo",
    "promotion",
    "popup",
    "modal",
    "overlay",
    "cookie",
    "tracking",
    "analytics",
    "share",
    "social",
    "sidebar",
    "related",
    "recommend",
    "comment",
    "footer",
    "navbar",
    "breadcrumb"
  ];
  const clutterPattern = new RegExp(`(^|[-_\\s])(${clutterWords.join("|")})([-_\\s]|$)`, "i");

  template.content.querySelectorAll("*").forEach((node) => {
    const hints = [
      node.id,
      node.className,
      node.getAttribute("role"),
      node.getAttribute("aria-label"),
      node.getAttribute("data-ad"),
      node.getAttribute("data-ads"),
      node.getAttribute("data-testid")
    ]
      .filter(Boolean)
      .join(" ");

    if (clutterPattern.test(hints)) node.remove();
  });
}

function exportBookBackup(book) {
  const backup = {
    app: "flight-reader",
    version: 1,
    exportedAt: new Date().toISOString(),
    book: normalizeBook(book)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${safeFileName(book.title || "flight-reader-book")}.flight-reader.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

function normalizeBackup(backup) {
  if (!backup || backup.app !== "flight-reader" || !backup.book) {
    throw new Error("This is not a Flight Reader backup.");
  }

  const book = normalizeBook(backup.book);
  if (!book.title || !book.chapters.length) {
    throw new Error("Backup does not contain a readable book.");
  }

  return {
    ...book,
    id: crypto.randomUUID(),
    addedAt: Date.now()
  };
}

function isBackupFile(file) {
  return /\.json$/i.test(file.name) || /json/i.test(file.type || "");
}

function backupBookFromRawText(text, fallback = {}) {
  if (!looksLikeFlightReaderBackup(text || "")) return null;

  try {
    const parsed = JSON.parse(text);
    const book = normalizeBook(parsed.book);
    if (!book.title || !book.chapters.length) return null;

    return {
      ...book,
      id: fallback.id || book.id || crypto.randomUUID(),
      addedAt: fallback.addedAt || book.addedAt || Date.now()
    };
  } catch {
    return null;
  }
}

function looksLikeFlightReaderBackup(text) {
  const value = (text || "").trim();
  return value.startsWith("{") && value.includes('"app"') && value.includes('"flight-reader"') && value.includes('"book"');
}

function safeFileName(value) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "flight-reader-book";
}

function loadBooks() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function normalizeBook(book = {}) {
  const rawBackupBook = backupBookFromRawText(book.text, book);
  if (rawBackupBook) return rawBackupBook;

  if (Array.isArray(book.chapters) && book.chapters.length) {
    const rawChapterBackupBook = backupBookFromRawText(book.chapters[0]?.text, book);
    if (rawChapterBackupBook) return rawChapterBackupBook;

    return {
      ...book,
      activeChapter: book.activeChapter || 0,
      progress: book.progress || 0,
      bookmark: book.bookmark || null
    };
  }

  return {
    id: book.id || crypto.randomUUID(),
    title: book.title || "Untitled",
    chapters: [
      {
        title: book.title || "Chapter 1",
        type: book.type || "text/plain",
        text: book.text || "",
        progress: book.progress || 0
      }
    ],
    activeChapter: 0,
    progress: book.progress || 0,
    bookmark: book.bookmark || null,
    addedAt: book.addedAt || Date.now()
  };
}

function loadSettings() {
  try {
    return { fontSize: 19, dark: false, ...JSON.parse(localStorage.getItem(settingsKey)) };
  } catch {
    return { fontSize: 19, dark: false };
  }
}

function applySettings() {
  document.body.classList.toggle("dark", settings.dark);
  document.documentElement.style.setProperty("--reader-size", `${settings.fontSize}px`);
  themeButton.textContent = settings.dark ? "Day" : "Night";
}

function persist(includeBooks = true) {
  if (includeBooks) localStorage.setItem(storageKey, JSON.stringify(books));
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function setUrlStatus(message, isLoading) {
  urlStatus.textContent = message;
  urlButton.disabled = isLoading;
  urlForm.classList.toggle("loading", isLoading);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}
