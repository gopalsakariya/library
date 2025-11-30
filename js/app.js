/* ============================================
   1. GOOGLE SHEET CONFIG & BOOK STORAGE
============================================ */

const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

const books = [];

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
const sortSelect = document.getElementById("sortSelect");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const applyFiltersButton = document.getElementById("applyFiltersButton");
const filtersButton = document.getElementById("filtersButton");

const viewSwitch = document.getElementById("viewSwitch");
const viewButtons = viewSwitch
  ? viewSwitch.querySelectorAll(".view-btn")
  : [];

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

const filtersModal = document.getElementById("filtersModal");
const filtersModalOverlay = filtersModal.querySelector(".modal-overlay");
const filtersModalClose = filtersModal.querySelector(".modal-close");

const mobileBottomNav = document.getElementById("mobileBottomNav");
const headerEl = document.querySelector("header");

let searchOverlay = null;

/* ============================================
   3. LOAD BOOKS FROM GOOGLE SHEET + CACHE
============================================ */

function mapRowToBook(row) {
  const title = (row.title || "").trim();
  const author = (row.author || "").trim();

  let category = (row.category || "Other").trim();
  if (category) {
    category =
      category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  } else {
    category = "Other";
  }

  const description = (row.description || "").trim();
  const details = (row.details || "").trim();

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

      if (!format) {
        if (lower === "pdf") format = "PDF";
        else if (lower === "epub") format = "EPUB";
        else if (lower === "mobi") format = "MOBI";
        else if (lower === "doc" || lower === "docx") format = "DOC";
      }

      const mbMatch = lower.match(/([\d.]+)\s*mb/);
      if (mbMatch) {
        const value = parseFloat(mbMatch[1]);
        if (!isNaN(value)) sizeMB = value;
      }

      const pagesMatch = lower.match(/(\d+)\s*pages?/);
      if (pagesMatch) {
        const value = parseInt(pagesMatch[1], 10);
        if (!isNaN(value)) pages = value;
      }
    });
  }

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
let currentView = "grid";

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
   9. CATEGORIES + FILTER CORE
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

  // keep existing filtersButton at the end, so rebuild only category buttons
  const filtersBtnEl = document.getElementById("filtersButton");

  categoryRow.innerHTML =
    `
    <button class="category-btn" data-category="all">All</button>
    <button class="category-btn" data-category="bookmarked">Bookmarked</button>
    ${cats
      .map(
        c => `<button class="category-btn" data-category="${c}">${c}</button>`
      )
      .join("")}
  ` + (filtersBtnEl ? filtersBtnEl.outerHTML : "");

  // regrab filtersButton reference because innerHTML recreated it
  const newFiltersButton = document.getElementById("filtersButton");
  if (newFiltersButton) {
    newFiltersButton.addEventListener("click", () => {
      openFiltersModal();
    });
  }

  if (!categoryRow.dataset.bound) {
    categoryRow.addEventListener("click", e => {
      const btn = e.target.closest(".category-btn");
      if (!btn || btn.id === "filtersButton") return;
      const cat = btn.dataset.category || "all";
      changeCategory(cat);
    });
    categoryRow.dataset.bound = "true";
  }

  const btns = categoryRow.querySelectorAll(".category-btn");
  btns.forEach(btn => {
    const bc = btn.dataset.category || "all";
    if (btn.id === "filtersButton") return;
    btn.classList.toggle("active", bc === currentCategory);
  });

  updateFiltersButtonActive();
}

function setActiveNav(navName) {
  if (!mobileBottomNav) return;
  const buttons = mobileBottomNav.querySelectorAll("button[data-nav]");
  buttons.forEach(btn => {
    const n = btn.dataset.nav;
    btn.classList.toggle("nav-active", n === navName);
  });
}

function resetFiltersToDefault() {
  currentSizeFilter = "any";
  currentPagesFilter = "any";
  currentSort = "relevance";

  if (sizeFilterSelect) {
    sizeFilterSelect.value = "any";
    sizeFilterSelect.classList.remove("active-filter");
  }
  if (pagesFilterSelect) {
    pagesFilterSelect.value = "any";
    pagesFilterSelect.classList.remove("active-filter");
  }
  if (sortSelect) {
    sortSelect.value = "relevance";
    sortSelect.classList.remove("active-filter");
  }

  updateFiltersButtonActive();
}

function updateFiltersButtonActive() {
  const btn = document.getElementById("filtersButton");
  if (!btn) return;
  const isActive =
    currentSizeFilter !== "any" ||
    currentPagesFilter !== "any" ||
    currentSort !== "relevance";
  btn.classList.toggle("active", isActive);
}

function changeCategory(cat) {
  currentCategory = cat || "all";

  if (categoryRow) {
    const btns = categoryRow.querySelectorAll(".category-btn");
    btns.forEach(btn => {
      if (btn.id === "filtersButton") return;
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
  currentPage = 1;

  resetFiltersToDefault();
  renderBooks();
}

function getFilteredBooks() {
  const q = normalize(currentSearch);

  let items = books.map(book => {
    if (currentCategory === "bookmarked" && !bookmarks.includes(book.title)) {
      return { book, score: -1 };
    }

    if (currentCategory !== "all" && currentCategory !== "bookmarked") {
      if (normalize(book.category) !== normalize(currentCategory)) {
        return { book, score: -1 };
      }
    }

    // size filter: lt1, 1..100, 100..200, 200..500, 500..1000, gt1000
    if (currentSizeFilter !== "any") {
      const size = typeof book.sizeMB === "number" ? book.sizeMB : null;
      if (size == null) return { book, score: -1 };

      if (currentSizeFilter === "lt1" && !(size < 1)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "1to100" && !(size >= 1 && size <= 100)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "100to200" && !(size >= 100 && size <= 200)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "200to500" && !(size >= 200 && size <= 500)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "500to1000" && !(size >= 500 && size <= 1000)) {
        return { book, score: -1 };
      }
      if (currentSizeFilter === "gt1000" && !(size > 1000)) {
        return { book, score: -1 };
      }
    }

    // pages filter: lt100, 100..200, 200..500, 500..1000, 1000..2000, gt2000
    if (currentPagesFilter !== "any") {
      const p = typeof book.pages === "number" ? book.pages : null;
      if (p == null) return { book, score: -1 };

      if (currentPagesFilter === "lt100" && !(p < 100)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "100to200" && !(p >= 100 && p <= 200)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "200to500" && !(p >= 200 && p <= 500)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "500to1000" && !(p >= 500 && p <= 1000)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "1000to2000" && !(p >= 1000 && p <= 2000)) {
        return { book, score: -1 };
      }
      if (currentPagesFilter === "gt2000" && !(p > 2000)) {
        return { book, score: -1 };
      }
    }

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

  items = items.filter(x => x.score > 0 || (!q && x.score === 1));

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
    items.sort(
      (a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title)
    );
  }

  return items;
}

/* ============================================
   10. POPUPS / MODALS
============================================ */

function isAnyPopupOpen() {
  const bookOpen = !bookModal.classList.contains("hidden");
  const catOpen = !categoryModal.classList.contains("hidden");
  const filtersOpen = !filtersModal.classList.contains("hidden");
  const searchOpen =
    searchOverlay && !searchOverlay.classList.contains("hidden");
  return bookOpen || catOpen || filtersOpen || searchOpen;
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

    ${
      book.description
        ? `<div class="modal-section">
             <h4>Summary</h4>
             <p>${book.description}</p>
           </div>`
        : ""
    }

    ${
      book.details
        ? `<div class="modal-section">
             <h4>Details</h4>
             <p>${book.details}</p>
           </div>`
        : ""
    }

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
          bookmarks.includes(book.title)
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

  const modalCover = modalBody.querySelector(".modal-cover");
  if (modalCover && book.pdfUrl) {
    modalCover.addEventListener("click", e => {
      e.stopPropagation();
      window.open(book.pdfUrl, "_blank", "noopener,noreferrer");
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

/* FILTERS MODAL */

function openFiltersModal() {
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "filtersModal" }, "");
  }
  filtersModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  updatePopupOpenClass();
}

function closeFiltersModal() {
  filtersModal.classList.add("hidden");
  document.body.style.overflow = "";
  updatePopupOpenClass();
}

filtersModalClose.addEventListener("click", closeFiltersModal);
filtersModalOverlay.addEventListener("click", closeFiltersModal);

if (filtersButton) {
  filtersButton.addEventListener("click", () => {
    openFiltersModal();
  });
}

/* SEARCH OVERLAY (mobile) */

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
  booksContainer.classList.toggle("list-view", currentView === "list");

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

        <div class="book-links">
          <a href="${book.pdfUrl || "#"}"
             target="_blank"
             rel="noopener noreferrer">
            <i class="fa-solid fa-book-open"></i>
            <span>Get PDF</span>
          </a>
        </div>
      </div>
    `;

    const bmBtn = card.querySelector(".bookmark-btn");
    bmBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleBookmark(book.title);
    });

    const coverEl = card.querySelector(".book-cover");
    if (coverEl && book.pdfUrl) {
      coverEl.addEventListener("click", e => {
        e.stopPropagation();
        window.open(book.pdfUrl, "_blank", "noopener,noreferrer");
      });
    }

    card.addEventListener("click", () => {
      openBookModal(book);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================
   12. SEARCH / FILTER / SORT / VIEW EVENTS
============================================ */

searchButton.addEventListener("click", () => {
  currentSearch = searchInput.value.trim();
  currentPage = 1;
  renderBooks();
});

searchInput.addEventListener("keyup", e => {
  if (e.key === "Enter") searchButton.click();
});

clearSearchButton.addEventListener("click", () => {
  currentSearch = "";
  searchInput.value = "";
  currentPage = 1;
  renderBooks();
});

if (sizeFilterSelect) {
  sizeFilterSelect.addEventListener("change", () => {
    currentSizeFilter = sizeFilterSelect.value || "any";
    sizeFilterSelect.classList.toggle(
      "active-filter",
      currentSizeFilter !== "any"
    );
    currentPage = 1;
    updateFiltersButtonActive();
    renderBooks();
  });
}

if (pagesFilterSelect) {
  pagesFilterSelect.addEventListener("change", () => {
    currentPagesFilter = pagesFilterSelect.value || "any";
    pagesFilterSelect.classList.toggle(
      "active-filter",
      currentPagesFilter !== "any"
    );
    currentPage = 1;
    updateFiltersButtonActive();
    renderBooks();
  });
}

if (sortSelect) {
  sortSelect.addEventListener("change", () => {
    currentSort = sortSelect.value || "relevance";
    sortSelect.classList.toggle("active-filter", currentSort !== "relevance");
    currentPage = 1;
    updateFiltersButtonActive();
    renderBooks();
  });
}

/* Clear all filters (size, length, sort) */

if (clearFiltersButton) {
  clearFiltersButton.addEventListener("click", () => {
    resetFiltersToDefault();
    currentPage = 1;
    renderBooks();
  });
}

/* Apply button simply closes modal (filters already applied on change) */

if (applyFiltersButton) {
  applyFiltersButton.addEventListener("click", () => {
    closeFiltersModal();
  });
}

/* View switch: grid / list */

viewButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view || "grid";
    currentView = view;
    viewButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
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
    if (!bookModal.classList.contains("hidden")) {
      closeBookModal();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    if (!categoryModal.classList.contains("hidden")) {
      closeCategoryModal();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    if (!filtersModal.classList.contains("hidden")) {
      closeFiltersModal();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

    if (searchOverlay && !searchOverlay.classList.contains("hidden")) {
      closeSearchOverlay();
      if (window.history && window.history.pushState) {
        history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
      }
      return;
    }

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
    if (!filtersModal.classList.contains("hidden")) closeFiltersModal();
    if (searchOverlay && !searchOverlay.classList.contains("hidden")) {
      closeSearchOverlay();
    }
  }
});

/* ============================================
   16. INITIALIZE
============================================ */

loadBooksFromSheet();
