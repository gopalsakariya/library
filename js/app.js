/* ============================================
   1. GOOGLE SHEET CONFIG & BOOK STORAGE
============================================ */

// Your Google Sheet ID
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

// Books stored here
const books = [];

/* Cover helper: supports URLs and local paths */
function getCoverPath(rawCover) {
  let cover = (rawCover || "").trim();
  if (!cover) return "img/book.jpg";

  // If looks like a URL
  if (/^https?:\/\//i.test(cover)) {
    return cover;
  }

  // Local path guess
  if (!cover.startsWith("img/")) {
    cover = "img/" + cover;
  }
  return cover;
}

/* Book object mapping from sheet row */
function mapRowToBook(row, index) {
  const title = (row.title || row.book || "").trim();
  const author = (row.author || "").trim();
  const category = (row.category || row.genre || "").trim() || "Other";

  const details = (row.details || "").trim();
  const rawTags = (row.tags || "").trim();
  const tags = rawTags
    ? rawTags.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  // direct URL for PDF (Cloudflare R2, etc.)
  const pdfUrl = (row.pdfurl || row.pdf || row.url || "").trim();

  const cover = getCoverPath(row.cover);

  return {
    id: row.id || String(index),
    title,
    author,
    category,
    details,
    tags,
    pdfUrl,
    cover
  };
}

/* Load from localStorage cache */
function loadBooksFromCache() {
  try {
    const str = localStorage.getItem("booksCache");
    if (!str) return false;
    const arr = JSON.parse(str);
    if (!Array.isArray(arr) || !arr.length) return false;

    books.length = 0;
    arr.forEach(b => books.push(b));
    return true;
  } catch (e) {
    console.error("Error reading books from cache:", e);
    return false;
  }
}

/* Save to localStorage cache */
function saveBooksToCache() {
  try {
    localStorage.setItem("booksCache", JSON.stringify(books));
  } catch (e) {
    console.error("Error saving books to cache:", e);
  }
}

/* ============================================
   2. DOM REFERENCES
============================================ */

const booksGrid = document.getElementById("booksGrid");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const resultsInfo = document.getElementById("resultsInfo");

const paginationControls = document.getElementById("paginationControls");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

const themeToggle = document.getElementById("themeToggle");
const categoryRow = document.getElementById("categories");

const bookModal = document.getElementById("bookModal");
const modalOverlay = bookModal.querySelector(".modal-overlay");
const modalClose = bookModal.querySelector(".modal-close");
const modalBody = bookModal.querySelector(".modal-body");

const categoryModal = document.getElementById("categoryModal");
const categoryModalOverlay = categoryModal.querySelector(".modal-overlay");
const categoryModalClose = categoryModal.querySelector(".modal-close");
const categoryList = document.getElementById("categoryList");

const mobileBottomNav = document.getElementById("mobileBottomNav");
const headerEl = document.querySelector("header");

let searchOverlay = null; // created lazily

/* ============================================
   3. LOAD BOOKS FROM GOOGLE SHEET + CACHE
============================================ */

function loadBooksFromSheet() {
  // Fast path: cache
  try {
    const cacheStr = localStorage.getItem("booksCache");
    if (cacheStr) {
      const cached = JSON.parse(cacheStr);
      if (Array.isArray(cached) && cached.length) {
        books.length = 0;
        cached.forEach(b => books.push(b));
        renderAll();
      }
    }
  } catch (e) {
    console.error("Error reading cached books:", e);
  }

  // Now attempt network fetch
  fetch(SHEET_URL)
    .then(res => res.json())
    .then(rows => {
      const mapped = rows.map(mapRowToBook);
      books.length = 0;
      mapped.forEach(b => books.push(b));
      saveBooksToCache();
      renderAll();
    })
    .catch(err => {
      console.error("Failed to load from Google Sheet:", err);
      // If no books at all, show fallback
      if (!books.length) {
        renderAll();
      }
    });
}

/* ============================================
   4. FILTERING, SEARCH, SORT, PAGINATION
============================================ */

let currentCategory = "all";
let currentSearch = "";
let currentSort = "title-asc";
let currentView = "all"; // all | bookmarks | history
let currentPage = 1;
const PAGE_SIZE = 18;

// Bookmarks & history in localStorage
let bookmarks = new Set(JSON.parse(localStorage.getItem("bookmarks") || "[]"));
let history = JSON.parse(localStorage.getItem("history") || "[]");

function isBookBookmarked(bookId) {
  return bookmarks.has(bookId);
}

function toggleBookmark(bookId) {
  if (bookmarks.has(bookId)) {
    bookmarks.delete(bookId);
  } else {
    bookmarks.add(bookId);
  }
  localStorage.setItem("bookmarks", JSON.stringify([...bookmarks]));
  renderAll();
}

function recordHistory(book) {
  const entry = {
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    openedAt: Date.now()
  };
  history.unshift(entry);
  // keep last 200
  history = history.slice(0, 200);
  localStorage.setItem("history", JSON.stringify(history));
}

function setSearch(value) {
  currentSearch = value.trim().toLowerCase();
  currentPage = 1;
  renderAll();
}

function setSort(sortKey) {
  currentSort = sortKey;
  currentPage = 1;
  renderAll();
}

function setView(view) {
  currentView = view;
  currentPage = 1;
  renderAll();
  updateViewTabs();
}

function changeCategory(cat) {
  currentCategory = cat;
  currentPage = 1;
  renderAll();
}

function getFilteredBooks() {
  let list = [...books];

  if (currentView === "bookmarks") {
    list = list.filter(b => isBookBookmarked(b.id));
  } else if (currentView === "history") {
    const historyIds = new Set(history.map(h => h.id));
    list = list.filter(b => historyIds.has(b.id));
  }

  if (currentCategory && currentCategory !== "all") {
    list = list.filter(
      b => (b.category || "").toLowerCase() === currentCategory.toLowerCase()
    );
  }

  if (currentSearch) {
    const q = currentSearch;
    list = list.filter(b => {
      const text =
        (b.title || "") +
        " " +
        (b.author || "") +
        " " +
        (b.details || "") +
        " " +
        (b.category || "") +
        " " +
        (b.tags || []).join(" ");
      return text.toLowerCase().includes(q);
    });
  }

  switch (currentSort) {
    case "title-asc":
      list.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "title-desc":
      list.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "author-asc":
      list.sort((a, b) => (a.author || "").localeCompare(b.author || ""));
      break;
    case "author-desc":
      list.sort((a, b) => (b.author || "").localeCompare(a.author || ""));
      break;
    default:
      break;
  }

  return list;
}

function getPagedBooks(filtered) {
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const slice = filtered.slice(start, end);
  return { slice, total, totalPages };
}

function renderPagination(total, totalPages) {
  if (!total) {
    paginationControls.classList.add("hidden");
    return;
  }

  paginationControls.classList.remove("hidden");
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

/* ============================================
   5. THEME (DARK / LIGHT)
============================================ */

function applyTheme() {
  // Force permanent dark gamer mode
  document.body.classList.add("dark");
  if (themeToggle) {
    // You can change this icon if you prefer a different static look
    themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
  }
}

// Always apply dark theme; no light mode
applyTheme();

// Keep the toggle button present but disable theme switching
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    // Intentionally left blank - theme is locked to dark mode
  });
}

/* ============================================
   6. HEADER HIDE ON SCROLL
============================================ */

let lastScrollY = window.scrollY;

window.addEventListener("scroll", () => {
  const y = window.scrollY;
  if (y > lastScrollY + 10 && y > 80) {
    headerEl.classList.add("header-hidden");
  } else if (y < lastScrollY - 10) {
    headerEl.classList.remove("header-hidden");
  }
  lastScrollY = y;
});

/* ============================================
   7. RENDER FUNCTIONS
============================================ */

function createBookCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "bookmark-btn";
  bookmarkBtn.innerHTML = isBookBookmarked(book.id)
    ? '<i class="fa-solid fa-bookmark"></i>'
    : '<i class="fa-regular fa-bookmark"></i>';

  bookmarkBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleBookmark(book.id);
  });

  const cover = document.createElement("img");
  cover.className = "book-cover";
  cover.src = book.cover || "img/book.jpg";
  cover.alt = book.title || "Book cover";

  const info = document.createElement("div");
  info.className = "book-info";

  const cat = document.createElement("div");
  cat.className = "book-category";
  cat.textContent = book.category || "Other";

  const titleEl = document.createElement("div");
  titleEl.className = "book-title";
  titleEl.textContent = book.title || "Untitled";

  const authorEl = document.createElement("div");
  authorEl.className = "book-author";
  authorEl.textContent = book.author || "Unknown author";

  const descEl = document.createElement("div");
  descEl.className = "book-description";
  const snippet =
    (book.details || "").length > 120
      ? (book.details || "").slice(0, 117) + "..."
      : book.details || "";
  descEl.textContent = snippet;

  const tagsEl = document.createElement("div");
  tagsEl.className = "book-tags";
  const parts = [];
  if (book.tags && book.tags.length) {
    parts.push(book.tags.join(" • "));
  }
  if (book.pdfUrl) {
    parts.push("PDF available");
  }
  tagsEl.textContent = parts.join(" • ");

  info.appendChild(cat);
  info.appendChild(titleEl);
  info.appendChild(authorEl);
  info.appendChild(descEl);
  info.appendChild(tagsEl);

  card.appendChild(bookmarkBtn);
  card.appendChild(cover);
  card.appendChild(info);

  card.addEventListener("click", () => {
    openBookModal(book);
    recordHistory(book);
  });

  return card;
}

function renderBooks() {
  const filtered = getFilteredBooks();
  const { slice, total, totalPages } = getPagedBooks(filtered);

  booksGrid.innerHTML = "";

  if (!total) {
    const empty = document.createElement("div");
    empty.id = "emptyState";
    empty.innerHTML = `
      <p>No books found.</p>
      <p>Try changing filters or search terms.</p>
    `;
    booksGrid.appendChild(empty);
    resultsInfo.textContent = "0 results";
    paginationControls.classList.add("hidden");
    return;
  }

  slice.forEach(book => {
    const card = createBookCard(book);
    booksGrid.appendChild(card);
  });

  resultsInfo.textContent = `${total} result${total === 1 ? "" : "s"}`;
  renderPagination(total, totalPages);
}

/* Category chips under stats panel */
function renderCategoryChips() {
  const cats = new Set();
  books.forEach(b => {
    if (b.category) {
      cats.add(b.category);
    }
  });

  const container = document.getElementById("categoryChipRow");
  if (!container) return;
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "category-pill";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => changeCategory("all"));
  container.appendChild(allBtn);

  [...cats].sort().forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "category-pill";
    btn.textContent = cat;
    btn.addEventListener("click", () => changeCategory(cat));
    container.appendChild(btn);
  });
}

/* Category list modal */
function openCategoryModal() {
  categoryModal.classList.add("visible");
  document.body.classList.add("popup-open");

  categoryList.innerHTML = "";
  const cats = new Set();
  books.forEach(b => {
    if (b.category) cats.add(b.category);
  });

  [...cats]
    .sort()
    .forEach(cat => {
      const li = document.createElement("li");
      li.textContent = cat;
      li.addEventListener("click", () => {
        changeCategory(cat);
        closeCategoryModal();
      });
      categoryList.appendChild(li);
    });
}

function closeCategoryModal() {
  categoryModal.classList.remove("visible");
  document.body.classList.remove("popup-open");
}

/* Book details modal */

function openBookModal(book) {
  modalBody.innerHTML = "";

  const content = document.createElement("div");
  content.className = "modal-content";

  const img = document.createElement("img");
  img.className = "modal-cover";
  img.src = book.cover || "img/book.jpg";
  img.alt = book.title || "Book cover";

  const main = document.createElement("div");
  main.className = "modal-main";

  const metaRow = document.createElement("div");
  metaRow.className = "modal-meta-row";

  const catPill = document.createElement("div");
  catPill.className = "modal-category-pill";
  catPill.textContent = book.category || "Other";

  metaRow.appendChild(catPill);

  const titleEl = document.createElement("div");
  titleEl.className = "modal-title";
  titleEl.textContent = book.title || "Untitled";

  const authorEl = document.createElement("div");
  authorEl.className = "modal-author";
  authorEl.textContent = book.author || "Unknown author";

  const descEl = document.createElement("div");
  descEl.className = "modal-description";
  descEl.textContent = book.details || "";

  const tagsEl = document.createElement("div");
  tagsEl.className = "modal-tags";
  if (book.tags && book.tags.length) {
    tagsEl.textContent = "Tags: " + book.tags.join(", ");
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "modal-bookmark-btn";
  bookmarkBtn.innerHTML = isBookBookmarked(book.id)
    ? '<i class="fa-solid fa-bookmark"></i> Bookmarked'
    : '<i class="fa-regular fa-bookmark"></i> Add to bookmarks';

  bookmarkBtn.addEventListener("click", () => {
    toggleBookmark(book.id);
    // reopen to refresh state
    openBookModal(book);
  });

  actions.appendChild(bookmarkBtn);

  if (book.pdfUrl) {
    const pdfBtn = document.createElement("a");
    pdfBtn.href = book.pdfUrl;
    pdfBtn.target = "_blank";
    pdfBtn.rel = "noopener noreferrer";
    pdfBtn.className = "modal-bookmark-btn";
    pdfBtn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Open PDF';
    actions.appendChild(pdfBtn);
  }

  main.appendChild(metaRow);
  main.appendChild(titleEl);
  main.appendChild(authorEl);
  main.appendChild(descEl);
  main.appendChild(tagsEl);
  main.appendChild(actions);

  content.appendChild(img);
  content.appendChild(main);
  modalBody.appendChild(content);

  bookModal.classList.add("visible");
  document.body.classList.add("popup-open");
}

function closeBookModal() {
  bookModal.classList.remove("visible");
  document.body.classList.remove("popup-open");
}

/* Stats panel */

function renderStatsPanel() {
  const totalBooks = books.length;
  const categories = new Set(books.map(b => b.category || "Other"));
  const bookmarkedCount = books.filter(b => isBookBookmarked(b.id)).length;

  const statsTotal = document.getElementById("statTotalBooks");
  const statsCategories = document.getElementById("statCategories");
  const statsBookmarks = document.getElementById("statBookmarks");

  if (statsTotal) statsTotal.textContent = String(totalBooks);
  if (statsCategories) statsCategories.textContent = String(categories.size);
  if (statsBookmarks) statsBookmarks.textContent = String(bookmarkedCount);
}

/* View tabs (All / Bookmarks / History) */

function updateViewTabs() {
  const tabs = document.querySelectorAll(".view-tab");
  tabs.forEach(tab => {
    const view = tab.getAttribute("data-view");
    if (view === currentView) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
}

/* Quick filters */

function applyQuickFilter(filter) {
  switch (filter) {
    case "recent":
      setSort("title-desc");
      break;
    case "bookmarked":
      setView("bookmarks");
      break;
    case "history":
      setView("history");
      break;
    default:
      break;
  }
}

/* Main render aggregator */

function renderAll() {
  renderBooks();
  renderCategoryChips();
  renderStatsPanel();
}

/* ============================================
   8. SEARCH OVERLAY (DESKTOP/MOBILE)
============================================ */

function ensureSearchOverlay() {
  if (searchOverlay) return;

  const overlay = document.createElement("div");
  overlay.id = "searchOverlay";

  overlay.innerHTML = `
    <div id="searchOverlayBackdrop"></div>
    <div id="searchOverlayPanel">
      <button id="searchOverlayClose" aria-label="Close search">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div id="searchOverlayInputRow">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="searchOverlayInput" type="text" placeholder="Search books, authors, tags..." />
      </div>
      <div id="searchOverlayChips"></div>
      <div id="searchOverlayResults"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  searchOverlay = overlay;

  const backdrop = document.getElementById("searchOverlayBackdrop");
  const closeBtn = document.getElementById("searchOverlayClose");
  const input = document.getElementById("searchOverlayInput");
  const chips = document.getElementById("searchOverlayChips");
  const results = document.getElementById("searchOverlayResults");

  function closeOverlay() {
    overlay.classList.remove("visible");
    document.body.classList.remove("popup-open");
  }

  backdrop.addEventListener("click", closeOverlay);
  closeBtn.addEventListener("click", closeOverlay);

  overlay.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeOverlay();
    }
  });

  // Popular tags / categories
  const cats = new Set();
  const tagCounts = new Map();
  books.forEach(b => {
    if (b.category) cats.add(b.category);
    (b.tags || []).forEach(t => {
      const key = t.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    });
  });

  const tagsSorted = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);

  function renderChips() {
    chips.innerHTML = "";
    [...cats]
      .sort()
      .slice(0, 8)
      .forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "quick-filter-pill";
        btn.textContent = cat;
        btn.addEventListener("click", () => {
          input.value = cat;
          handleSearch(cat);
        });
        chips.appendChild(btn);
      });

    tagsSorted.forEach(tag => {
      const btn = document.createElement("button");
      btn.className = "quick-filter-pill";
      btn.textContent = tag;
      btn.addEventListener("click", () => {
        input.value = tag;
        handleSearch(tag);
      });
      chips.appendChild(btn);
    });
  }

  function handleSearch(value) {
    const q = value.trim().toLowerCase();
    results.innerHTML = "";
    if (!q) return;

    const matches = books.filter(b => {
      const text =
        (b.title || "") +
        " " +
        (b.author || "") +
        " " +
        (b.details || "") +
        " " +
        (b.category || "") +
        " " +
        (b.tags || []).join(" ");
      return text.toLowerCase().includes(q);
    });

    matches.slice(0, 30).forEach(b => {
      const item = document.createElement("div");
      item.className = "search-overlay-result-item";
      item.innerHTML = `
        <div class="search-overlay-title">${b.title || "Untitled"}</div>
        <div class="search-overlay-meta">
          ${(b.author || "Unknown author")} • ${(b.category || "Other")}
        </div>
      `;
      item.addEventListener("click", () => {
        closeOverlay();
        openBookModal(b);
        recordHistory(b);
      });
      results.appendChild(item);
    });
  }

  input.addEventListener("input", e => {
    handleSearch(e.target.value);
  });

  renderChips();
}

function openSearchOverlay() {
  ensureSearchOverlay();
  searchOverlay.classList.add("visible");
  document.body.classList.add("popup-open");
  const input = document.getElementById("searchOverlayInput");
  if (input) {
    input.value = "";
    input.focus();
  }
}

/* ============================================
   9. MOBILE BOTTOM NAV
============================================ */

function setMobileNavActive(section) {
  if (!mobileBottomNav) return;
  const buttons = mobileBottomNav.querySelectorAll("button[data-section]");

  buttons.forEach(btn => {
    const s = btn.getAttribute("data-section");
    if (s === section) {
      btn.classList.add("nav-active");
    } else {
      btn.classList.remove("nav-active");
    }
  });
}

function initMobileNav() {
  if (!mobileBottomNav) return;

  mobileBottomNav.addEventListener("click", e => {
    const btn = e.target.closest("button[data-section]");
    if (!btn) return;
    const section = btn.getAttribute("data-section");

    switch (section) {
      case "home":
        setView("all");
        changeCategory("all");
        break;
      case "bookmarks":
        setView("bookmarks");
        break;
      case "history":
        setView("history");
        break;
      case "search":
        openSearchOverlay();
        break;
      default:
        break;
    }

    setMobileNavActive(section);
  });
}

/* ============================================
   10. HISTORY VIEW INITIALIZATION
============================================ */

function initHistory() {
  // No special UI for history beyond the view, but here
  // we could add more analytics or last-opened states.
}

/* ============================================
   11. EVENT LISTENERS
============================================ */

searchButton.addEventListener("click", () => {
  setSearch(searchInput.value);
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  setSearch("");
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    setSearch(searchInput.value);
  }
});

// Sort buttons
const sortButtons = document.querySelectorAll(".sort-btn");
sortButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const sortKey = btn.getAttribute("data-sort");
    setSort(sortKey);
    sortButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// View tabs
const viewTabs = document.querySelectorAll(".view-tab");
viewTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const view = tab.getAttribute("data-view");
    setView(view);
  });
});

// Category modal open
if (categoryRow) {
  const showCategoriesBtn = categoryRow.querySelector(
    "[data-action='show-categories']"
  );
  if (showCategoriesBtn) {
    showCategoriesBtn.addEventListener("click", openCategoryModal);
  }
}

categoryModalOverlay.addEventListener("click", closeCategoryModal);
categoryModalClose.addEventListener("click", closeCategoryModal);

// Book modal
modalOverlay.addEventListener("click", closeBookModal);
modalClose.addEventListener("click", closeBookModal);

// Search overlay trigger (header search icon)
const openSearchOverlayBtn = document.getElementById("openSearchOverlay");
if (openSearchOverlayBtn) {
  openSearchOverlayBtn.addEventListener("click", openSearchOverlay);
}

// Pagination
prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderAll();
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
    renderAll();
});

/* ============================================
   12. INIT
============================================ */

function isOnHomeScreen() {
  return currentCategory === "all" && !currentSearch;
}

function init() {
  loadBooksFromSheet();
  initMobileNav();
  updateViewTabs();
  if (isOnHomeScreen()) {
    setMobileNavActive("home");
  } else {
    setMobileNavActive("all");
  }

  initHistory();
}

document.addEventListener("DOMContentLoaded", init);
