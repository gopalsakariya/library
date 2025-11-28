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
  return cover; // treat as relative/local path (e.g. img/book1.png)
}

/* ============================================
   2. DOM ELEMENTS
============================================ */

const booksContainer = document.getElementById("booksContainer");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");

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
  const category = (row.category || "Other").trim();
  const description = (row.description || "").trim();
  const details = (row.details || "").trim();
  const rawTags = (row.tags || "").trim();
  const tags = rawTags
    ? rawTags.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  // direct URL for PDF (Cloudflare R2, etc.)
  const pdfurl = (row.pdfurl || row.pdf || row.url || "").trim();

  const viewLink = pdfurl || "#";
  const downloadLink = pdfurl || "#";

  const cover = getCoverPath(row.cover);

  return {
    title,
    author,
    category,
    description,
    details,
    tags,
    viewLink,
    downloadLink,
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
      console.error("Error loading books from Google Sheet:", err);
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
    themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
  } else {
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

window.addEventListener("scroll", () => {
  const y = window.scrollY;
  if (y > lastScrollY + 10 && y > 60) {
    headerEl.classList.add("header-hidden");
  } else if (y < lastScrollY - 10) {
    headerEl.classList.remove("header-hidden");
  }
  lastScrollY = y;
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
  text = normalize(text);
  query = normalize(query);
  if (!query) return 0;
  if (text.includes(query)) return query.length * 3;

  let best = Infinity;
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    best = Math.min(best, levenshtein(w, query));
  }
  const len = Math.max(query.length, 3);
  return best <= Math.floor(len / 2) ? len - best : 0;
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

  sortControls.classList.add("hidden");
  sortButtons.forEach(b => b.classList.remove("active"));
  const relBtn = document.querySelector('.sort-btn[data-sort="relevance"]');
  if (relBtn) relBtn.classList.add("active");

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

    if (!q) return { book, score: 1 };

    const s =
      getMatchScore(book.title, q) * 3 +
      getMatchScore(book.author, q) * 2 +
      getMatchScore(book.category, q) * 2 +
      getMatchScore(book.description, q);

    return { book, score: s };
  });

  items = items.filter(x => x.score > 0 || (!q && x.score === 1));

  if (currentSort === "title") {
    items.sort((a, b) => a.book.title.localeCompare(b.book.title));
  } else if (currentSort === "author") {
    items.sort((a, b) => a.book.author.localeCompare(b.book.author));
  } else if (currentSort === "category") {
    items.sort((a, b) => a.book.category.localeCompare(b.book.category));
  } else {
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
  document.body.classList.toggle("popup-open", isAnyPopupOpen());
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

    <div class="modal-section modal-actions">
      <a href="${book.viewLink}"
         target="_blank"
         rel="noopener noreferrer"
         class="modal-btn"
         data-role="read-link"
         data-title="${book.title}">
         <i class="fa-solid fa-book-open"></i>
         <span>Read</span>
      </a>
      <a href="#"
         class="modal-btn"
         data-download="${book.downloadLink}">
         <i class="fa-solid fa-download"></i>
         <span>Download</span>
      </a>
    </div>
  `;

  bookModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setActiveNav(null);
  updatePopupOpenClass();
}

function closeBookModal() {
  bookModal.classList.add("hidden");
  document.body.style.overflow = "";
  updatePopupOpenClass();
}

modalClose.addEventListener("click", closeBookModal);
modalOverlay.addEventListener("click", closeBookModal);

function openCategoryModal() {
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "categoryModal" }, "");
  }

  const cats = getAllCategories();
  categoryList.innerHTML = cats
    .map(cat => {
      const label =
        cat === "all" ? "All" : cat === "bookmarked" ? "Bookmarked" : cat;
      return `<button class="category-pill" data-cat="${cat}">${label}</button>`;
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

function ensureSearchOverlay() {
  if (searchOverlay) return;

  searchOverlay = document.createElement("div");
  searchOverlay.id = "searchOverlay";
  searchOverlay.className = "modal search-overlay hidden";
  searchOverlay.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-dialog search-dialog">
      <button class="modal-close" type="button">&times;</button>
      <div class="modal-body">
        <div class="search-overlay-inner">
          <input id="searchOverlayInput" type="text" placeholder="Search books..." />
          <div class="search-overlay-actions">
            <button id="searchOverlaySearch">Search</button>
            <button id="searchOverlayClear">Clear</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(searchOverlay);

  const ov = searchOverlay.querySelector(".modal-overlay");
  const closeBtn = searchOverlay.querySelector(".modal-close");
  const input = searchOverlay.querySelector("#searchOverlayInput");
  const searchBtn = searchOverlay.querySelector("#searchOverlaySearch");
  const clearBtn = searchOverlay.querySelector("#searchOverlayClear");

  const close = () => {
    searchOverlay.classList.add("hidden");
    document.body.style.overflow = "";
    updatePopupOpenClass();
    if (isOnHomeScreen()) {
      setActiveNav("home");
    } else if (currentCategory === "bookmarked") {
      setActiveNav("bookmarks");
    } else {
      setActiveNav(null);
    }
  };

  ov.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  searchBtn.addEventListener("click", () => {
    const val = input.value.trim();
    searchInput.value = val;
    currentSearch = val;
    currentPage = 1;
    sortControls.classList.toggle("hidden", !currentSearch);
    renderBooks();
    close();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    searchInput.value = "";
    currentSearch = "";
    currentPage = 1;
    sortControls.classList.add("hidden");
    renderBooks();
    close();
  });

  input.addEventListener("keyup", e => {
    if (e.key === "Enter") searchBtn.click();
  });
}

function openSearchOverlay() {
  ensureSearchOverlay();
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "searchOverlay" }, "");
  }
  const input = searchOverlay.querySelector("#searchOverlayInput");
  searchOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  updatePopupOpenClass();
  input.value = searchInput.value;
  setActiveNav("search");
  setTimeout(() => input.focus(), 100);
}

function closeSearchOverlay() {
  if (!searchOverlay) return;
  searchOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  updatePopupOpenClass();
  if (isOnHomeScreen()) {
    setActiveNav("home");
  } else if (currentCategory === "bookmarked") {
    setActiveNav("bookmarks");
  } else {
    setActiveNav(null);
  }
}

/* Back button / navigation handler */

function handleBackNavigation() {
  // 0) If search overlay is open, close it first
  if (searchOverlay && !searchOverlay.classList.contains("hidden")) {
    closeSearchOverlay();
    if (window.history && window.history.pushState) {
      history.pushState({ screen: isOnHomeScreen() ? "home" : "page" }, "");
    }
    return;
  }

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

  // 3) If not on home, go home instead of leaving
  if (!isOnHomeScreen()) {
    changeCategory("all");
    if (window.history && window.history.replaceState) {
      history.replaceState({ screen: "home" }, "");
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
        onclick="toggleBookmark('${book.title.replace(/'/g, "\\'")}')">
        <i class="${starred ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
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
        <a href="${book.viewLink}"
           target="_blank"
           rel="noopener noreferrer"
           data-role="read-link"
           data-title="${book.title}">
           <i class="fa-solid fa-book-open"></i>
           <span>Read</span>
        </a>
        <a href="#"
           data-download="${book.downloadLink}">
           <i class="fa-solid fa-download"></i>
           <span>Download</span>
        </a>
      </div>
    `;

    const imgEl = card.querySelector(".book-cover");
    imgEl.onload = () => {
      const w = imgEl.naturalWidth;
      const h = imgEl.naturalHeight;
      if (!w || !h) return;
      const r = Number((w / h).toFixed(2));
      imgEl.style.objectFit = Math.abs(r - 0.66) < 0.03 ? "cover" : "fill";
    };

    card.addEventListener("click", e => {
      if (e.target.closest(".book-links") || e.target.closest(".bookmark-btn"))
        return;
      openBookModal(book);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================
   12. DOWNLOAD HANDLER (NO NEW TAB)
============================================ */

function triggerDownload(url) {
  if (!url || url === "#") return;
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", "");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

document.addEventListener("click", e => {
  const dlBtn = e.target.closest("[data-download]");
  if (!dlBtn) return;
  e.preventDefault();
  const url = dlBtn.dataset.download;
  triggerDownload(url);
});

/* ============================================
   13. SEARCH, CLEAR, SORT
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

sortButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    sortButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort || "relevance";
    renderBooks();
  });
});

/* ============================================
   14. PAGINATION CONTROLS
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
   15. MOBILE BOTTOM NAV
============================================ */

mobileBottomNav.addEventListener("click", e => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;

  if (isAnyPopupOpen()) return;

  const nav = btn.dataset.nav;

  if (nav === "home") {
    changeCategory("all");
    setActiveNav("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (nav === "bookmarks") {
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
   16. INITIALIZE
============================================ */

loadBooksFromSheet();
