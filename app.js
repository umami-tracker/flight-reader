const storageKey = "flight-reader-v2";
const settingsKey = "flight-reader-settings-v2";

const $ = (selector) => document.querySelector(selector);

const fileInput = $("#fileInput");
const backupInput = $("#backupInput");
const urlForm = $("#urlForm");
const urlInput = $("#urlInput");
const urlStatus = $("#urlStatus");
const urlButton = $("#urlButton");
const pasteForm = $("#pasteForm");
const pasteTitle = $("#pasteTitle");
const pasteText = $("#pasteText");
const pasteStatus = $("#pasteStatus");
const demoButton = $("#demoButton");
const searchInput = $("#searchInput");
const clearButton = $("#clearButton");
const bookList = $("#bookList");
const reader = $(".reader");
const content = $("#content");
const bookTitle = $("#bookTitle");
const metaLine = $("#metaLine");
const progressBar = $("#progressBar");
const progressText = $("#progressText");
const bookmarkText = $("#bookmarkText");
const chapterControls = $("#chapterControls");
const chapterSelect = $("#chapterSelect");
const prevChapter = $("#prevChapter");
const nextChapter = $("#nextChapter");
const shelfButton = $("#shelfButton");
const bookmarkButton = $("#bookmarkButton");
const jumpBookmarkButton = $("#jumpBookmarkButton");
const exportButton = $("#exportButton");
const exportSidebarButton = $("#exportSidebarButton");
const decreaseFont = $("#decreaseFont");
const increaseFont = $("#increaseFont");
const themeButton = $("#themeButton");
const installButton = $("#installButton");

let books = loadBooks().map(normalizeBook).filter((book) => book.chapters.length);
let settings = loadSettings();
let activeId = settings.activeId || books[0]?.id || null;
let deferredInstall = null;

persist();
applySettings();
renderLibrary();
openBook(activeId);

fileInput?.addEventListener("change", async (event) => {
  await importFiles([...event.target.files]);
  fileInput.value = "";
});

backupInput?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) await importBackupFile(file);
  backupInput.value = "";
});

urlForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setUrlStatus("Importing...", true);
  try {
    const book = await fetchBookFromUrl(url);
    addBooks([book]);
    urlInput.value = "";
    setUrlStatus("Imported. Test airplane mode before flying.", false);
  } catch (error) {
    setUrlStatus(error.message || "Could not import that URL.", false);
  }
});

pasteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = pasteText.value.trim();
  if (!text) {
    pasteStatus.textContent = "Paste readable text first.";
    return;
  }

  const title = pasteTitle.value.trim() || "Pasted chapters";
  const chapters = splitChapters(text).map((chapter, index) => ({
    title: chapter.title || `${title} ${index + 1}`,
    type: "text/plain",
    text: chapter.text,
    progress: 0
  }));

  addBooks([
    {
      id: crypto.randomUUID(),
      title,
      chapters,
      activeChapter: 0,
      bookmark: null,
      addedAt: Date.now()
    }
  ]);
  pasteForm.reset();
  pasteStatus.textContent = "Saved to shelf.";
});

demoButton?.addEventListener("click", () => {
  addBooks([buildDemoBook()]);
});

searchInput?.addEventListener("input", renderLibrary);

clearButton?.addEventListener("click", () => {
  if (!books.length || !confirm("Remove all books from this browser?")) return;
  books = [];
  activeId = null;
  persist();
  renderLibrary();
  openBook(null);
});

content?.addEventListener("scroll", () => {
  const book = activeBook();
  if (!book) return;
  const chapter = currentChapter(book);
  chapter.progress = scrollProgress(content);
  book.progress = totalProgress(book);
  updateReadingMeta(book);
  persist();
  renderLibrary(false);
});

chapterSelect?.addEventListener("change", () => openChapter(Number(chapterSelect.value)));
prevChapter?.addEventListener("click", () => openChapter(currentChapterIndex(activeBook()) - 1));
nextChapter?.addEventListener("click", () => openChapter(currentChapterIndex(activeBook()) + 1));
shelfButton?.addEventListener("click", () => document.body.classList.toggle("show-library"));
bookmarkButton?.addEventListener("click", saveBookmark);
jumpBookmarkButton?.addEventListener("click", jumpToBookmark);
exportButton?.addEventListener("click", exportActiveBook);
exportSidebarButton?.addEventListener("click", exportActiveBook);

decreaseFont?.addEventListener("click", () => {
  settings.fontSize = Math.max(17, settings.fontSize - 1);
  applySettings();
  persist(false);
});

increaseFont?.addEventListener("click", () => {
  settings.fontSize = Math.min(30, settings.fontSize + 1);
  applySettings();
  persist(false);
});

themeButton?.addEventListener("click", () => {
  settings.dark = !settings.dark;
  applySettings();
  persist(false);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstall = event;
  installButton?.classList.remove("hidden");
});

installButton?.addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  installButton.classList.add("hidden");
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function importFiles(files) {
  const backupBooks = [];
  const chapters = [];

  for (const file of files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const text = await file.text();
    const backupBook = backupBookFromRawText(text);
    if (isBackupFile(file) && backupBook) {
      backupBooks.push(backupBook);
      continue;
    }

    chapters.push({
      title: file.name.replace(/\.(txt|md|html?|markdown|json)$/i, ""),
      type: file.type || "text/plain",
      text,
      progress: 0
    });
  }

  const imported = [...backupBooks];
  if (chapters.length === 1) {
    imported.push(newBook(chapters[0].title, chapters));
  } else if (chapters.length > 1) {
    imported.push(newBook(`Imported chapters ${new Date().toLocaleDateString()}`, chapters));
  }

  if (imported.length) addBooks(imported);
}

async function importBackupFile(file) {
  const book = backupBookFromRawText(await file.text());
  if (!book) {
    alert("This is not a readable Flight Reader backup.");
    return;
  }
  addBooks([book]);
}

function addBooks(newBooks) {
  books.unshift(...newBooks.map(normalizeBook));
  activeId = books[0]?.id || null;
  persist();
  renderLibrary();
  openBook(activeId);
}

function renderLibrary(allowEmpty = true) {
  if (!bookList) return;
  const query = (searchInput?.value || "").trim().toLowerCase();
  const filtered = books.filter((book) => book.title.toLowerCase().includes(query));

  if (!filtered.length) {
    bookList.innerHTML = allowEmpty ? `<p class="empty">${books.length ? "No matching books." : "Your shelf is empty."}</p>` : "";
    return;
  }

  bookList.innerHTML = filtered
    .map((book) => {
      const chapters = getChapters(book);
      const percent = Math.round(totalProgress(book) * 100);
      const active = book.id === activeId ? " active" : "";
      const mark = book.bookmark ? " - bookmarked" : "";
      return `
        <button class="book${active}" type="button" data-id="${escapeHtml(book.id)}">
          <strong>${escapeHtml(book.title)}</strong>
          <small>${chapters.length} chapter${chapters.length === 1 ? "" : "s"} - ${percent}% read${mark}</small>
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
    document.body.classList.remove("reading-active", "show-library");
    setText(bookTitle, "Import a novel file");
    setText(metaLine, "Your offline shelf is ready");
    chapterControls?.classList.add("hidden");
    setButtonsDisabled(true);
    if (content) {
      content.innerHTML = `
        <p>Bring your own legally saved novel files, import them before boarding, and read with no internet.</p>
        <p>Your books stay in this browser. Flight Reader remembers your chapter, progress, bookmark, theme, and font size on this device.</p>
      `;
    }
    updateEmptyMeta();
    persist(false);
    return;
  }

  document.body.classList.add("reading-active");
  document.body.classList.remove("show-library");
  const chapter = currentChapter(book);
  setText(bookTitle, book.title);
  setText(metaLine, chapter ? `${chapter.title} - Offline mode` : "Offline mode");
  setButtonsDisabled(false);
  renderChapterControls(book);
  if (content) content.innerHTML = renderChapter(chapter);

  requestAnimationFrame(() => {
    if (content && chapter) {
      content.scrollTop = Math.round((content.scrollHeight - content.clientHeight) * (chapter.progress || 0));
    }
    updateReadingMeta(book);
  });

  persist(false);
  renderLibrary(false);
}

function renderChapterControls(book) {
  const chapters = getChapters(book);
  if (!chapterControls || !chapterSelect) return;
  chapterControls.classList.toggle("hidden", chapters.length <= 1);
  chapterSelect.innerHTML = chapters
    .map((chapter, index) => `<option value="${index}">${index + 1}. ${escapeHtml(chapter.title)}</option>`)
    .join("");
  const index = currentChapterIndex(book);
  chapterSelect.value = String(index);
  if (prevChapter) prevChapter.disabled = index <= 0;
  if (nextChapter) nextChapter.disabled = index >= chapters.length - 1;
}

function openChapter(index) {
  const book = activeBook();
  if (!book) return;
  const chapters = getChapters(book);
  book.activeChapter = Math.max(0, Math.min(index, chapters.length - 1));
  openBook(book.id);
}

function saveBookmark() {
  const book = activeBook();
  if (!book) return;
  const index = currentChapterIndex(book);
  const chapter = currentChapter(book);
  book.bookmark = {
    chapter: index,
    progress: chapter?.progress || scrollProgress(content),
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
  const chapterProgress = Math.round((currentChapter(book)?.progress || 0) * 100);
  if (progressBar) progressBar.style.width = `${total}%`;
  setText(progressText, `${total}% read - chapter ${index + 1}, ${chapterProgress}%`);

  if (book.bookmark) {
    const markChapter = (book.bookmark.chapter || 0) + 1;
    const markProgress = Math.round((book.bookmark.progress || 0) * 100);
    setText(bookmarkText, `Bookmark: chapter ${markChapter}, ${markProgress}%`);
    if (jumpBookmarkButton) jumpBookmarkButton.disabled = false;
  } else {
    setText(bookmarkText, "No bookmark");
    if (jumpBookmarkButton) jumpBookmarkButton.disabled = true;
  }
}

function updateEmptyMeta() {
  if (progressBar) progressBar.style.width = "0%";
  setText(progressText, "0% read");
  setText(bookmarkText, "No bookmark");
}

function renderChapter(chapter = {}) {
  const text = chapter.text || "";
  if (looksLikeFlightReaderBackup(text)) {
    return `<p>This file is a Flight Reader backup. Use Import backup or Import files to restore it into the shelf.</p>`;
  }

  if (/html/i.test(chapter.type || "") || /<\/?[a-z][\s\S]*>/i.test(text.slice(0, 500))) {
    return sanitizeHtml(text);
  }

  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function fetchBookFromUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a full URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http:// or https:// links are supported.");

  const response = await fetch(parsed.href, { mode: "cors" });
  if (!response.ok) throw new Error(`The website returned ${response.status}.`);
  const type = response.headers.get("content-type") || "text/plain";
  const text = await response.text();
  return newBook(titleFromUrl(parsed, text), [{ title: titleFromUrl(parsed, text), type, text, progress: 0 }]);
}

function splitChapters(text) {
  const marker = /^(chapter|ep\.?|episode|\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48|\u0e1a\u0e17\u0e17\u0e35\u0e48)\s*[\w\d\u0e50-\u0e59]+.*$/i;
  const chapters = [];
  let current = null;

  text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    if (marker.test(line.trim())) {
      if (current?.text.trim()) chapters.push({ title: current.title, text: current.text.trim() });
      current = { title: line.trim(), text: "" };
      return;
    }
    if (!current) current = { title: "", text: "" };
    current.text += `${line}\n`;
  });

  if (current?.text.trim()) chapters.push({ title: current.title, text: current.text.trim() });
  return chapters.length ? chapters : [{ title: "", text }];
}

function exportActiveBook() {
  const book = activeBook();
  if (!book) return;
  const backup = { app: "flight-reader", version: 2, exportedAt: new Date().toISOString(), book: normalizeBook(book) };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(book.title)}.flight-reader.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDemoBook() {
  const title = "Demo: Bangkok Night Flight";
  const chapterTexts = [
    [
      "บทที่ 1 - ก่อนเครื่องขึ้น",
      "สนามบินตอนดึกมีเสียงประกาศเป็นจังหวะเหมือนนาฬิกาใหญ่กำลังนับถอยหลัง ผู้โดยสารลากกระเป๋าผ่านไฟสีขาวเย็น ๆ และทุกคนดูเหมือนกำลังเก็บโลกทั้งใบไว้ในหน้าจอมือถือของตัวเอง",
      "ธีร์เปิด Flight Reader แล้วเช็กเล่มที่เตรียมไว้ เขากด Bookmark ไว้ตรงกลางบท เผื่อหลังอาหารบนเครื่องจะกลับมาอ่านต่อได้ทันทีโดยไม่ต้องไล่หาหน้าเดิม",
      "สัญญาณอินเทอร์เน็ตไม่สำคัญอีกต่อไป เพราะเรื่องทั้งหมดอยู่ในเครื่องเรียบร้อยแล้ว"
    ],
    [
      "บทที่ 2 - โหมดเครื่องบิน",
      "หลังเครื่องไต่ระดับ ไฟเข็มขัดยังสว่างอยู่ เมืองข้างล่างกลายเป็นเส้นสีทองบาง ๆ เหมือนลายมันบนเนื้อวากิวที่ถูกแล่อย่างตั้งใจ",
      "ธีร์แตะ Night mode หน้าจอเปลี่ยนเป็นสีเข้มสบายตา ตัวอักษรใหญ่พอดีกับมือเดียว เขาเลื่อนอ่านช้า ๆ และรู้สึกว่าการเตรียมของก่อนบินช่วยลดความวุ่นวายในหัวได้มากกว่าที่คิด",
      "บางครั้งความสะดวกไม่ได้มาจากแอพที่ฉลาดที่สุด แต่มาจากของที่พร้อมใช้ตอนที่ไม่มีอะไรพร้อมเลย"
    ],
    [
      "บทที่ 3 - ที่คั่นหน้า",
      "เสียงรถเข็นอาหารใกล้เข้ามา ธีร์กด Mark ก่อนวางมือถือ เขารู้ว่าอีกไม่กี่นาทีจังหวะอ่านจะถูกตัดด้วยถาดอาหาร น้ำเปล่า และคำถามว่าเอาชาหรือกาแฟ",
      "เมื่อทุกอย่างเงียบลงอีกครั้ง เขากด Go mark แล้วกลับมายังย่อหน้าเดิมทันที ไม่มีการเดา ไม่มีการเลื่อนหา ไม่มีอารมณ์สะดุด",
      "ที่คั่นหน้าเล็ก ๆ ทำให้การอ่านยาวสิบห้าชั่วโมงดูเป็นไปได้ขึ้นเยอะ"
    ],
    [
      "บทที่ 4 - สำรองไว้บนมือถือ",
      "ก่อนบินครั้งหน้า ธีร์ export book เป็นไฟล์ backup แล้วส่งเข้า LINE ให้ตัวเอง พอเปิดบนมือถืออีกเครื่อง เขาแค่กด Restore book backup แล้วทั้งเล่มก็กลับมาอยู่ใน shelf",
      "หนังสือไม่ได้ลอยอยู่บน cloud แปลก ๆ มันอยู่ใน browser storage ของเครื่องที่เขาเลือกเอง และถ้าจะย้ายก็ย้ายด้วยไฟล์ backup ที่เขาถือไว้",
      "เครื่องบินยังบินต่อไปในความมืด แต่หน้าอ่านยังนิ่ง สะอาด และพร้อมสำหรับบทถัดไป"
    ]
  ];

  return newBook(
    title,
    chapterTexts.map((parts) => ({
      title: parts[0],
      type: "text/plain",
      text: parts.join("\n\n"),
      progress: 0
    }))
  );
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
  const words = ["ad", "ads", "advert", "advertisement", "banner", "sponsor", "sponsored", "promo", "popup", "modal", "overlay", "cookie", "tracking", "share", "social", "sidebar", "related", "recommend", "comment", "footer", "navbar"];
  const pattern = new RegExp(`(^|[-_\\s])(${words.join("|")})([-_\\s]|$)`, "i");
  template.content.querySelectorAll("*").forEach((node) => {
    const hints = [node.id, node.className, node.getAttribute("role"), node.getAttribute("aria-label"), node.getAttribute("data-testid")]
      .filter(Boolean)
      .join(" ");
    if (pattern.test(hints)) node.remove();
  });
}

function newBook(title, chapters) {
  return { id: crypto.randomUUID(), title, chapters, activeChapter: 0, progress: 0, bookmark: null, addedAt: Date.now() };
}

function normalizeBook(book = {}) {
  const rawBackup = backupBookFromRawText(book.text, book) || backupBookFromRawText(book.chapters?.[0]?.text, book);
  if (rawBackup) return rawBackup;

  const chapters = Array.isArray(book.chapters) && book.chapters.length
    ? book.chapters
    : [{ title: book.title || "Chapter 1", type: book.type || "text/plain", text: book.text || "", progress: book.progress || 0 }];

  return {
    id: book.id || crypto.randomUUID(),
    title: book.title || "Untitled",
    chapters: chapters.map((chapter, index) => ({
      title: chapter.title || `Chapter ${index + 1}`,
      type: chapter.type || "text/plain",
      text: chapter.text || "",
      progress: clamp01(chapter.progress || 0)
    })),
    activeChapter: Math.max(0, book.activeChapter || 0),
    progress: clamp01(book.progress || 0),
    bookmark: book.bookmark || null,
    addedAt: book.addedAt || Date.now()
  };
}

function backupBookFromRawText(text, fallback = {}) {
  if (!looksLikeFlightReaderBackup(text || "")) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed.app !== "flight-reader" || !parsed.book) return null;
    const book = normalizeBook(parsed.book);
    return { ...book, id: fallback.id || crypto.randomUUID(), addedAt: fallback.addedAt || Date.now() };
  } catch {
    return null;
  }
}

function looksLikeFlightReaderBackup(text) {
  const value = (text || "").trim();
  return value.startsWith("{") && value.includes('"flight-reader"') && value.includes('"book"');
}

function isBackupFile(file) {
  return /\.json$/i.test(file.name) || /json/i.test(file.type || "");
}

function getChapters(book) {
  return Array.isArray(book?.chapters) ? book.chapters : [];
}

function activeBook() {
  return books.find((book) => book.id === activeId);
}

function currentChapter(book) {
  return getChapters(book)[currentChapterIndex(book)];
}

function currentChapterIndex(book) {
  const chapters = getChapters(book);
  if (!chapters.length) return 0;
  return Math.max(0, Math.min(book?.activeChapter || 0, chapters.length - 1));
}

function totalProgress(book) {
  const chapters = getChapters(book);
  if (!chapters.length) return 0;
  const index = currentChapterIndex(book);
  return clamp01((index + (chapters[index]?.progress || 0)) / chapters.length);
}

function scrollProgress(element) {
  if (!element) return 0;
  const scrollable = element.scrollHeight - element.clientHeight;
  return scrollable > 0 ? clamp01(element.scrollTop / scrollable) : 0;
}

function setButtonsDisabled(disabled) {
  [bookmarkButton, jumpBookmarkButton, exportButton, exportSidebarButton].forEach((button) => {
    if (button) button.disabled = disabled;
  });
}

function focusReaderOnSmallScreen() {
  if (window.matchMedia("(max-width: 900px)").matches) {
    document.body.classList.remove("show-library");
    reader?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function applySettings() {
  document.body.classList.toggle("dark", settings.dark);
  document.documentElement.style.setProperty("--reader-size", `${settings.fontSize}px`);
  setText(themeButton, settings.dark ? "Day" : "Night");
}

function loadBooks() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function loadSettings() {
  try {
    return { fontSize: 21, dark: false, ...JSON.parse(localStorage.getItem(settingsKey)) };
  } catch {
    return { fontSize: 21, dark: false };
  }
}

function persist(includeBooks = true) {
  if (includeBooks) localStorage.setItem(storageKey, JSON.stringify(books));
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function setUrlStatus(message, loading) {
  setText(urlStatus, message);
  if (urlButton) urlButton.disabled = loading;
  urlForm?.classList.toggle("loading", loading);
}

function titleFromUrl(url, text) {
  const title = text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
  if (title) return decodeEntities(title);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname).replace(/\.(txt|md|html?)$/i, "");
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function safeFileName(value) {
  return (value || "flight-reader-book")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "flight-reader-book";
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
