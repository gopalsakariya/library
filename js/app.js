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
  if (cover.startsWith("http://") || cover.startsWith("https://")) return cover;
  return cover;
}

/* ============================================
   2. DOM ELEMENTS
============================================ */

const booksContainer = document.getElementById("booksContainer");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const sizeFilterSelect = document.getElementById("sizeFilter");
const pagesFilterSelect = document.getElementById("pagesFilter");

const sortControls = document.getElementById("sortControls");
const sortButtons = document.querySelectorAll(".sort-btn");
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

function mapRowToBook(row) {
  const title = (row.title || "").trim();
  const author = (row.author || "").trim();

  // Normalize category: first letter uppercase, rest lowercase
  let category = (row.category || "Other").trim();
  if (category) {
    category =
      category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  } else {
    category = "Other";
  }

  const description = (row.description || "").trim();
  const details = (row.details || "").trim();

  // Parse tags string, e.g. "PDF, 10 MB, 150 Pages"
  const rawTags = (row.tags || "").trim();

  let tags = [];
  let format = "";
  let sizeMB = null;
  let pages = null;

  if (rawTags) {
    const parts = rawTags
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);

    tags = parts;

    parts.forEach(p => {
      const lower = p.toLowerCase();

      // Detect format
      if (!format) {
        if (lower === "pdf") format = "PDF";
        else if (lower === "epub") format = "EPUB";
        else if (lower === "mobi") format = "MOBI";
        else if (lower === "doc" || lower === "docx") format = "DOC";
      }

      // Detect "10 MB"
      const mbMatch = lower.match(/([\d.]+)\s*mb/);
      if (mbMatch) {
        const value = parseFloat(mbMatch[1]);
        if (!isNaN(value)) sizeMB = value;
      }

      // Detect "150 Pages"
      const pagesMatch = lower.match(/(\d+)\s*pages?/);
      if (pagesMatch) {
        const value = parseInt(pagesMatch[1], 10);
        if (!isNaN(value)) pages = value;
      }
    });
  }

  // direct URL for PDF (Cloudflare R2, etc.)
  const pdfUrl = (row.pdfurl || row.pdf || row.url || "").trim();

  const cover = getCoverPath(row.cover);

  return {
    title,
    author,
    category,
    description,
    details,
    tags,
    rawTags,
    format,
    sizeMB,
    pages,
    pdfUrl,
    cover
  };
}


let historyInitialized = false;
let exitConfirmShown = false;
let firstDataApplied = false;

function initHistory() {
  if (historyInitialized) return;
  if (!window.history || !window.history.replaceState) return;
  historyInitialized = true;
  history.replaceState({ screen: "home" }, "");
  window.addEventListener("popstate", handleBackNavigation);
}

function applyBooksAndInit(newBooks) {
  const hadDataBefore = firstDataApplied;
  firstDataApplied = true;

  books.length = 0;
  newBooks.forEach(b => books.push(b));

  renderTopCategories();

  if (hadDataBefore) {
    renderBooks();
  } else {
    changeCategory("all");
  }

  initHistory();
}

function loadBooksFromSheet() {
  // Fast path: cache
  try {
    const cacheStr = localStorage.getItem("booksCache");
    if (cacheStr) {
      const cached = JSON.parse(cacheStr);
      if (Array.isArray(cached) && cached.length) {
        applyBooksAndInit(cached);
      }
    } else {
      booksContainer.innerHTML = "<p>Loading books...</p>";
    }
  } catch {
    booksContainer.innerHTML = "<p>Loading books...</p>";
  }

  // Always fetch latest in background
  fetch(SHEET_URL)
    .then(res => res.json())
    .then(rows => {
      const mapped = rows.map(mapRowToBook);
      localStorage.setItem("booksCache", JSON.stringify(mapped));
      applyBooksAndInit(mapped);
    })
    .catch(err => {
      console.error("Error loading sheet:", err);
      if (!firstDataApplied) {
        booksContainer.innerHTML = "<p>Failed to load books.</p>";
      }
    });
}

/* ============================================
   4. STATE
============================================ */

let currentCategory = "all";
let currentSearch = "";
let currentSort = "relevance";
let currentPage = 1;
const pageSize = 40;

let currentSizeFilter = "any";
let currentPagesFilter = "any";

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

function isOnHomeScreen() {
  return currentCategory === "all" && !currentSearch;
}

/* ============================================
   5. THEME (DARK / LIGHT)
============================================ */

function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
  } else {
    document.body.classList.add("light");
    document.body.classList.remove("dark");
    themeToggle.innerHTML = '<i class="fa-regular fa-moon"></i>';
  }
}

applyTheme(localStorage.getItem("theme") || "dark");

themeToggle.addEventListener("click", () => {
  const newTheme = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme);
});

/* ============================================
   6. HEADER HIDE ON SCROLL
============================================ */

let lastScrollY = window.scrollY;
let headerHidden = false;

window.addEventListener("scroll", () => {
  const current = window.scrollY;
  if (current > lastScrollY + 10 && current > 80 && !headerHidden) {
    headerEl.style.transform = "translateY(-100%)";
    headerHidden = true;
  } else if (current < lastScrollY - 10 && headerHidden) {
    headerEl.style.transform = "";
    headerHidden = false;
  }
  lastScrollY = current;
});

/* ============================================
   7. HELPERS
============================================ */

function normalize(str) {
  return (str || "").toString().toLowerCase();
}

function levenshtein(a, b) {
  a = normalize(a);
  b = normalize(b);
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function getMatchScore(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  if (!t || !q) return 0;

  const idx = t.indexOf(q);
  if (idx === 0) return 10 + (t === q ? 5 : 0);
  if (idx > 0) return 6;

  const dist = levenshtein(t, q);
  if (dist === 0) return 8;
  if (dist === 1) return 6;
  if (dist === 2) return 4;
  if (dist <= 4) return 2;
  return 0;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text) {
  if (!currentSearch) return text;
  const q = currentSearch.trim();
  if (!q) return text;
  return text.replace(
    new RegExp(escapeRegExp(q), "ig"),
    m => `<mark>${m}</mark>`
  );
}

/* ============================================
   8. BOOKMARKS
============================================ */

function toggleBookmark(title) {
  if (bookmarks.includes(title)) {
    bookmarks = bookmarks.filter(t => t !== title);
  } else {
    bookmarks.push(title);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks();
}

/* ============================================
   9. CATEGORY & FILTERING
============================================ */

function getAllCategories() {
  const set = new Set(["all", "bookmarked"]);
  books.forEach(b => set.add(b.category));
  return [...set];
}

function renderTopCategories() {
  if (!categoryRow) return;

  const cats = getAllCategories().filter(
    c => c !== "all" && c !== "bookmarked"
  );

  categoryRow.innerHTML = `
    <button class="category-btn" data-category="all">All</button>
    <button class="category-btn" data-category="bookmarked">Bookmarked</button>
    ${cats
      .map(
        c => `<button class="category-btn" data-category="${c}">${c}</button>`
      )
      .join("")}
  `;

  if (!categoryRow.dataset.bound) {
    categoryRow.addEventListener("click", e => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      const cat = btn.dataset.category || "all";
      changeCategory(cat);
    });
    categoryRow.dataset.bound = "true";
  }

  const btns = categoryRow.querySelectorAll(".category-btn");
  btns.forEach(btn => {
    const bc = btn.dataset.category || "all";
    btn.classList.toggle("active", bc === currentCategory);
  });
}

function setActiveNav(navName) {
  if (!mobileBottomNav) return;
  const buttons = mobileBottomNav.querySelectorAll("button[data-nav]");
  buttons.forEach(btn => {
    const n = btn.dataset.nav;
    btn.classList.toggle("nav-active", n === navName);
  });
}

function changeCategory(cat) {
  currentCategory = cat || "all";

  if (categoryRow) {
    const btns = categoryRow.querySelectorAll(".category-btn");
    btns.forEach(btn => {
      const bc = btn.dataset.category || "all";
      btn.classList.toggle("active", bc === currentCategory);
    });
  }

  if (isOnHomeScreen()) {
    setActiveNav("home");
  } else if (currentCategory === "bookmarked") {
    setActiveNav("bookmarks");
  } else {
    setActiveNav(null);
  }

  currentSearch = "";
  searchInput.value = "";
  currentSort = "relevance";
  currentPage = 1;

  // reset advanced filters
  currentSizeFilter = "any";
  currentPagesFilter = "any";
  if (sizeFilterSelect) sizeFilterSelect.value = "any";
  if (pagesFilterSelect) pagesFilterSelect.value = "any";

  sortControls.classList.add("hidden");
  sortButtons.forEach(b => b.classList.remove("active"));
  const relBtn = document.querySelector('.sort-btn[data-sort="relevance"]');
  if (relBtn) relBtn.classList.add("active");

  renderBooks();
}


/* ============================================
   9.1 FILTER + SORT CORE
============================================ */

function getFilteredBooks() {
  const q = normalize(currentSearch);

  let items = books.map(book => {
    // Bookmark filter
    if (currentCategory === "bookmarked" && !bookmarks.includes(book.title)) {
      return { book, score: -1 };
    }

    // Category filter
    if (currentCategory !== "all" && currentCategory !== "bookmarked") {
      if (normalize(book.category) !== normalize(currentCategory)) {
        return { book, score: -1 };
      }
    }

    // Size filter (using sizeMB from tags)
    if (currentSizeFilter !== "any") {
      const size = typeof book.sizeMB === "number" ? book.sizeMB : null;
      if (size == null) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "small" && !(size < 5)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "medium" && !(size >= 5 && size <= 20)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "large" && !(size > 20)) {
        return { book, score: -1 };
      }
    }

    // Pages filter (using pages from tags)
    if (currentPagesFilter !== "any") {
      const p = typeof book.pages === "number" ? book.pages : null;
      if (p == null) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "short" && !(p < 100)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "medium" && !(p >= 100 && p <= 300)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "long" && !(p > 300)) {
        return { book, score: -1 };
      }
    }

    // No search query -> neutral positive score
    if (!q) return { book, score: 1 };

    const tagsText =
      book.tags && book.tags.length ? book.tags.join(" ") : "";

    const s =
      getMatchScore(book.title, q) * 3 +
      getMatchScore(book.author, q) * 2 +
      getMatchScore(book.category, q) * 2 +
      getMatchScore(book.description, q) +
      getMatchScore(tagsText, q) * 2;

    return { book, score: s };
  });

  // Remove filtered out items
  items = items.filter(x => x.score > 0 || (!q && x.score === 1));

  // Sorting
  if (currentSort === "title") {
    items.sort((a, b) => a.book.title.localeCompare(b.book.title));
  } else if (currentSort === "author") {
    items.sort((a, b) => a.book.author.localeCompare(b.book.author));
  } else if (currentSort === "category") {
    items.sort((a, b) => a.book.category.localeCompare(b.book.category));
  } else if (currentSort === "sizeAsc") {
    items.sort((a, b) => {
      const sa = a.book.sizeMB;
      const sb = b.book.sizeMB;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb;
    });
  } else if (currentSort === "sizeDesc") {
    items.sort((a, b) => {
      const sa = a.book.sizeMB;
      const sb = b.book.sizeMB;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
  } else if (currentSort === "pagesAsc") {
    items.sort((a, b) => {
      const pa = a.book.pages;
      const pb = b.book.pages;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
  } else if (currentSort === "pagesDesc") {
    items.sort((a, b) => {
      const pa = a.book.pages;
      const pb = b.book.pages;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pb - pa;
    });
  } else {
    // relevance
    items.sort(
      (a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title)
    );
  }

  return items;
}

/* ============================================
   10. POPUP / MODALS & BACK HANDLING
============================================ */

function isAnyPopupOpen() {
  const bookOpen = !bookModal.classList.contains("hidden");
  const catOpen = !categoryModal.classList.contains("hidden");
  const searchOpen =
    searchOverlay && !searchOverlay.classList.contains("hidden");
  return bookOpen || catOpen || searchOpen;
}

function updatePopupOpenClass() {
  if (isAnyPopupOpen()) {
    document.body.classList.add("popup-open");
  } else {
    document.body.classList.remove("popup-open");
  }
}

function openBookModal(book) {
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "bookModal" }, "");
  }

  const cover = book.cover || "img/book.jpg";

  const tagChips =
    book.tags && book.tags.length
      ? book.tags.map(t => `<span class="tag-chip">${t}</span>`).join(" ")
      : "";

  // Build file info text
  let fileInfoHtml = "";
  const fileInfoParts = [];

  if (book.format) {
    fileInfoParts.push(`<strong>Format:</strong> ${book.format}`);
  }

  if (typeof book.sizeMB === "number") {
    let sizeLabel = "";
    if (book.sizeMB < 5) sizeLabel = "Small file";
    else if (book.sizeMB <= 20) sizeLabel = "Medium file";
    else sizeLabel = "Large file";
    fileInfoParts.push(`<strong>Size:</strong> ${book.sizeMB} MB (${sizeLabel})`);
  }

  if (typeof book.pages === "number") {
    let lengthLabel = "";
    if (book.pages < 100) lengthLabel = "Short";
    else if (book.pages <= 300) lengthLabel = "Medium";
    else lengthLabel = "Long";
    fileInfoParts.push(`<strong>Length:</strong> ${book.pages} pages (${lengthLabel})`);
  }

  if (fileInfoParts.length) {
    fileInfoHtml = `
      <div class="modal-section">
        <h4>File info</h4>
        <p>${fileInfoParts.join("<br/>")}</p>
      </div>
    `;
  }

  const isBookmarked = bookmarks.includes(book.title);

  modalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${cover}" alt="" onerror="this.src='img/book.jpg';" />
      <div class="modal-book-main">
        <h3>${book.title}</h3>
        <p class="modal-author-category">
          <span class="mac-author">${book.author}</span>
          <span class="mac-separator">•</span>
          <span class="mac-category">${book.category}</span>
          ${
            tagChips
              ? `<span class="mac-separator">•</span>
                 <span class="mac-tags">${tagChips}</span>`
              : ""
          }
        </p>
      </div>
    </div>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${book.description}</p>
    </div>

    ${
      book.details
        ? `<div class="modal-section">
             <h4>Details</h4>
             <p>${book.details}</p>
           </div>`
        : ""
    }

    ${fileInfoHtml}

    <div class="modal-section modal-actions">
      <a href="${book.pdfUrl || "#"}"
         target="_blank"
         rel="noopener noreferrer"
         class="modal-btn">
         <i class="fa-solid fa-file-pdf"></i>
         <span>Get PDF</span>
      </a>
      <button type="button"
              class="modal-btn"
              id="bookmarkToggleBtn">
        ${
          isBookmarked
            ? '<i class="fa-solid fa-star"></i><span>Remove bookmark</span>'
            : '<i class="fa-regular fa-star"></i><span>Bookmark</span>'
        }
      </button>
    </div>
  `;

  bookModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setActiveNav(null);
  updatePopupOpenClass();

  // Attach bookmark handler (do not close modal)
  const bookmarkToggleBtn = modalBody.querySelector("#bookmarkToggleBtn");
  if (bookmarkToggleBtn) {
    bookmarkToggleBtn.addEventListener("click", () => {
      const wasBookmarked = bookmarks.includes(book.title);
      toggleBookmark(book.title);
      const isNowBookmarked = !wasBookmarked;
      bookmarkToggleBtn.innerHTML = isNowBookmarked
        ? '<i class="fa-solid fa-star"></i><span>Remove bookmark</span>'
        : '<i class="fa-regular fa-star"></i><span>Bookmark</span>';
    });
  }
}

function closeBookModal() {
  bookModal.classList.add("hidden");
  document.body.style.overflow = "";
  updatePopupOpenClass();
}

modalClose.addEventListener("click", closeBookModal);
modalOverlay.addEventListener("click", closeBookModal);

/* CATEGORY MODAL */

function openCategoryModal() {
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "categoryModal" }, "");
  }

  const cats = getAllCategories();
  categoryList.innerHTML = cats
    .map(cat => {
      const isActive = cat === currentCategory;
      return `<button class="category-pill" data-cat="${cat}">
        ${isActive ? "★ " : ""}${cat}
      </button>`;
    })
    .join("");

  categoryModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setActiveNav("categories");
  updatePopupOpenClass();
}

function closeCategoryModal() {
  categoryModal.classList.add("hidden");
  document.body.style.overflow = "";
  updatePopupOpenClass();
}

categoryModalClose.addEventListener("click", closeCategoryModal);
categoryModalOverlay.addEventListener("click", closeCategoryModal);

categoryList.addEventListener("click", e => {
  const btn = e.target.closest(".category-pill");
  if (!btn) return;
  const cat = btn.dataset.cat || "all";
  changeCategory(cat);
  closeCategoryModal();
});

/* SEARCH OVERLAY */

function ensureSearchOverlay() {
  if (searchOverlay) return;

  searchOverlay = document.createElement("div");
  searchOverlay.id = "searchOverlay";
  searchOverlay.className = "modal search-overlay hidden";
  searchOverlay.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-dialog">
      <button class="modal-close" type="button" aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="modal-body">
        <h3>Search library</h3>
        <div id="overlaySearchBar" class="overlay-search-bar">
          <input type="text" id="overlaySearchInput" placeholder="Search books..." />
          <button id="overlaySearchButton" title="Search">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(searchOverlay);

  const overlayClose = searchOverlay.querySelector(".modal-close");
  const overlayOverlay = searchOverlay.querySelector(".modal-overlay");
  const overlayInput = searchOverlay.querySelector("#overlaySearchInput");
  const overlayButton = searchOverlay.querySelector("#overlaySearchButton");

  function doSearch() {
    currentSearch = overlayInput.value.trim();
    searchInput.value = currentSearch;
    currentPage = 1;
    sortControls.classList.toggle("hidden", !currentSearch);
    renderBooks();
    closeSearchOverlay();
  }

  overlayClose.addEventListener("click", closeSearchOverlay);
  overlayOverlay.addEventListener("click", closeSearchOverlay);
  overlayButton.addEventListener("click", doSearch);
  overlayInput.addEventListener("keyup", e => {
    if (e.key === "Enter") doSearch();
  });
}

function openSearchOverlay() {
  ensureSearchOverlay();
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "searchOverlay" }, "");
  }
  searchOverlay.classList.remove("hidden");
  const overlayInput = searchOverlay.querySelector("#overlaySearchInput");
  if (overlayInput) {
    overlayInput.value = currentSearch || "";
    overlayInput.focus();
    overlayInput.select();
  }
  updatePopupOpenClass();
}

function closeSearchOverlay() {
  if (!searchOverlay) return;
  searchOverlay.classList.add("hidden");
  updatePopupOpenClass();
}

/* ============================================
   11. RENDER BOOKS + PAGINATION
============================================ */

function renderBooks() {
  const allItems = getFilteredBooks();
  const total = allItems.length;

  if (!currentSearch) {
    resultsInfo.textContent = "";
  } else if (!total) {
    resultsInfo.textContent = "0 results found.";
  } else {
    resultsInfo.textContent = `${total} result${total > 1 ? "s" : ""} found.`;
  }

  if (!total) {
    booksContainer.innerHTML = "<p>No books found.</p>";
    paginationControls.classList.add("hidden");
    return;
  }

  const totalPages = Math.ceil(total / pageSize);
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const items = allItems.slice(start, start + pageSize);

  if (total > pageSize) {
    paginationControls.classList.remove("hidden");
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
  } else {
    paginationControls.classList.add("hidden");
  }

  booksContainer.innerHTML = "";

  items.forEach(({ book }) => {
    const card = document.createElement("div");
    card.className = "book-card";

    const starred = bookmarks.includes(book.title);
    const cover = book.cover || "img/book.jpg";

    card.innerHTML = `
      <button class="bookmark-btn" type="button"
              title="${starred ? "Remove bookmark" : "Bookmark"}">
        ${
          starred
            ? '<i class="fa-solid fa-star"></i>'
            : '<i class="fa-regular fa-star"></i>'
        }
      </button>

      <img class="book-cover"
           src="${cover}"
           alt=""
           onerror="this.src='img/book.jpg';" />

      <div class="book-info">
        <div class="book-title">${highlight(book.title)}</div>
        <div class="book-author">by ${highlight(book.author)}</div>
        <div class="book-category">Category: ${highlight(book.category)}</div>
        <div class="book-desc">${highlight(book.description)}</div>
      </div>

      <div class="book-links">
        <a href="${book.pdfUrl || "#"}"
           target="_blank"
           rel="noopener noreferrer">
          <i class="fa-solid fa-book-open"></i> Open PDF
        </a>
      </div>
    `;

    const bmBtn = card.querySelector(".bookmark-btn");
    bmBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleBookmark(book.title);
    });

    card.addEventListener("click", () => {
      openBookModal(book);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================
   12. SEARCH, CLEAR, SORT, FILTER EVENTS
============================================ */

searchButton.addEventListener("click", () => {
  currentSearch = searchInput.value.trim();
  currentPage = 1;
  sortControls.classList.toggle("hidden", !currentSearch);
  renderBooks();
});

searchInput.addEventListener("keyup", e => {
  if (e.key === "Enter") searchButton.click();
});

clearSearchButton.addEventListener("click", () => {
  currentSearch = "";
  searchInput.value = "";
  currentPage = 1;
  sortControls.classList.add("hidden");
  renderBooks();
});

// Advanced size/pages filter controls
if (sizeFilterSelect) {
  sizeFilterSelect.addEventListener("change", () => {
    currentSizeFilter = sizeFilterSelect.value || "any";
    currentPage = 1;
    renderBooks();
  });
}

if (pagesFilterSelect) {
  pagesFilterSelect.addEventListener("change", () => {
    currentPagesFilter = pagesFilterSelect.value || "any";
    currentPage = 1;
    renderBooks();
  });
}

sortButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    sortButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort || "relevance";
    renderBooks();
  });
});

/* ============================================
   13. PAGINATION CONTROLS
============================================ */

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderBooks();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage++;
  renderBooks();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ============================================
   14. MOBILE BOTTOM NAV
============================================ */

mobileBottomNav.addEventListener("click", e => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;
  const nav = btn.dataset.nav;

  if (nav === "home") {
    changeCategory("all");
    setActiveNav("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (nav === "bookmarks") {
    currentCategory = "bookmarked";
    changeCategory("bookmarked");
    setActiveNav("bookmarks");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (nav === "categories") {
    setActiveNav("categories");
    openCategoryModal();
  } else if (nav === "search") {
    openSearchOverlay();
  }
});

/* ============================================
   15. BACK BUTTON HANDLING
============================================ */

function handleBackNavigation(event) {
  const state = event.state || { screen: "home" };

  if (state.screen === "home") {
    // 1) If a book modal is open, close it
    if (!bookModal.classList.contains("hidden")) {
      closeBookModal();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    // 2) If category modal is open, close it
    if (!categoryModal.classList.contains("hidden")) {
      closeCategoryModal();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    // 3) If search overlay open, close it
    if (searchOverlay && !searchOverlay.classList.contains("hidden")) {
      closeSearchOverlay();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    // 4) Already on home -> once ask before leaving
    if (!exitConfirmShown) {
      const leave = window.confirm("Do you want to leave the library app?");
      if (leave) {
        window.removeEventListener("popstate", handleBackNavigation);
        if (window.history && window.history.back) {
          history.back();
        }
      } else {
        exitConfirmShown = true;
        if (window.history && window.history.pushState) {
          history.pushState({ screen: "home" }, "");
        }
      }
    }
  }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!bookModal.classList.contains("hidden")) closeBookModal();
    if (!categoryModal.classList.contains("hidden")) closeCategoryModal();
    if (searchOverlay && !searchOverlay.classList.contains("hidden")) {
      closeSearchOverlay();
    }
  }
});

/* ============================================
   16. INITIALIZE
============================================ */

loadBooksFromSheet();
