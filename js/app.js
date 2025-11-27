/* ============================================
   1. GOOGLE SHEET CONFIG & BOOK STORAGE
============================================ */

// Your Google Sheet ID
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";

// First sheet/tab = "1"
const SHEET_TAB = "1";

// OpenSheet URL (turns your sheet into JSON)
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

// Books will be loaded from Google Sheet into this array
const books = [];

/* Helper for cover paths: supports full URLs AND local paths
   Examples allowed in Google Sheet:
   - https://example.com/cover.jpg
   - img/book1.png
   - covers/mahabharat.png
   - just "book1.png" (relative to the page)
*/
function getCoverPath(rawCover) {
  let cover = (rawCover || "").trim();

  // Fallback if empty
  if (!cover) {
    return "img/book.jpg";
  }

  // If it starts with http/https, treat as full URL; otherwise
  // treat it as a relative/local path exactly as written.
  if (cover.startsWith("http://") || cover.startsWith("https://")) {
    return cover;
  }

  return cover;
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

// dynamic category row (All + Bookmarked + from sheet)
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

let searchOverlay = null; // will be created on demand

function setActiveNav(navName) {
  if (!mobileBottomNav) return;
  const buttons = mobileBottomNav.querySelectorAll("button[data-nav]");
  buttons.forEach(btn => {
    const n = btn.dataset.nav;
    btn.classList.toggle("nav-active", n === navName);
  });
}

function isAnyPopupOpen() {
  const bookOpen = !bookModal.classList.contains("hidden");
  const catOpen = !categoryModal.classList.contains("hidden");
  const searchOpen = searchOverlay && !searchOverlay.classList.contains("hidden");
  return bookOpen || catOpen || searchOpen;
}


const headerEl = document.querySelector("header");

/* ============================================
   2.5 LOAD BOOKS FROM GOOGLE SHEET + CACHE
============================================ */

function mapRowToBook(row) {
  // Your headers: title, author, category, fileid, cover, tags, description, details
  const title = (row.title || "").trim();
  const author = (row.author || "").trim();
  const category = (row.category || "Other").trim();
  const description = (row.description || "").trim();
  const details = (row.details || "").trim();

  const rawTags = (row.tags || "").trim();
  const tags = rawTags
    ? rawTags.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  const fileId = (row.fileid || row.fileId || "").trim();

  let viewLink = "#";
  let downloadLink = "#";

  if (fileId) {
    viewLink = `https://drive.google.com/file/d/${fileId}/view`;
    downloadLink = `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  // cover can now be a full URL OR a local/relative path like "img/book1.png"
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
    // Preserve current state (category/search) and just re-render
    renderBooks();
  } else {
    // First time data loaded → go to home
    changeCategory("all");
  }

  initHistory();
}

function loadBooksFromSheet() {
  // Try fast load from localStorage cache first
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
  } catch (e) {
    booksContainer.innerHTML = "<p>Loading books...</p>";
  }

  // Always fetch fresh data in the background
  fetch(SHEET_URL)
    .then(res => res.json())
    .then(rows => {
      const mapped = rows.map(mapRowToBook);
      // store latest in cache for faster next load
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
   3. STATE
============================================ */

let currentCategory = "all";
let currentSearch = "";
let currentSort = "relevance";
let currentPage = 1;
const pageSize = 40;

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");
let readStats = JSON.parse(localStorage.getItem("readStats") || "{}");

function isOnHomeScreen() {
  return currentCategory === "all" && !currentSearch;
}

/* ============================================
   4. THEME (DARK / LIGHT)
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
   5. HEADER HIDE ON SCROLL
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
   6. HELPERS (NORMALIZE, LEVENSHTEIN, HIGHLIGHT)
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
  return text.replace(new RegExp(escapeRegExp(q), "ig"), m => `<mark>${m}</mark>`);
}

/* ============================================
   7. BOOKMARKS & READ STATS
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

function recordRead(title) {
  const now = new Date().toISOString();
  const stat = readStats[title] || { count: 0, lastRead: null };
  stat.count++;
  stat.lastRead = now;
  readStats[title] = stat;
  localStorage.setItem("readStats", JSON.stringify(readStats));
}

function formatLastRead(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

/* ============================================
   8. CATEGORY & FILTERING
============================================ */

function getAllCategories() {
  // Always keep these two special categories
  const set = new Set(["all", "bookmarked"]);
  books.forEach(b => set.add(b.category));
  return [...set];
}

function renderTopCategories() {
  if (!categoryRow) return;

  // Get all categories and remove the two special ones
  const cats = getAllCategories().filter(
    c => c !== "all" && c !== "bookmarked"
  );

  // Build the buttons: All + Bookmarked + dynamic ones
  categoryRow.innerHTML = `
    <button class="category-btn" data-category="all">All</button>
    <button class="category-btn" data-category="bookmarked">Bookmarked</button>
    ${cats
      .map(
        c => `<button class="category-btn" data-category="${c}">${c}</button>`
      )
      .join("")}
  `;

  // Add click handling once (event delegation)
  if (!categoryRow.dataset.bound) {
    categoryRow.addEventListener("click", e => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      const cat = btn.dataset.category || "all";
      changeCategory(cat);
    });
    categoryRow.dataset.bound = "true";
  }

  // Make sure correct button is highlighted after render
  const btns = categoryRow.querySelectorAll(".category-btn");
  btns.forEach(btn => {
    const bc = btn.dataset.category || "all";
    btn.classList.toggle("active", bc === currentCategory);
  });
}

function changeCategory(cat) {
  currentCategory = cat || "all";

  // highlight the active button in the top row
  if (categoryRow) {
    const btns = categoryRow.querySelectorAll(".category-btn");
    btns.forEach(btn => {
      const bc = btn.dataset.category || "all";
      btn.classList.toggle("active", bc === currentCategory);
    });
  }

  // update nav active state
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
    if (e.key === "Enter") {
      searchBtn.click();
    }
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
  input.value = searchInput.value;
  setActiveNav("search");
  setTimeout(() => input.focus(), 100);
}

function closeSearchOverlay() {
  if (!searchOverlay) return;
  searchOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  // After closing, adjust nav state based on where we are
  if (isOnHomeScreen()) {
    setActiveNav("home");
  } else if (currentCategory === "bookmarked") {
    setActiveNav("bookmarks");
  } else {
    setActiveNav(null);
  }
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
    items.sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title));
  }

  return items;
}

/* ============================================
   9. MODALS (BOOK & CATEGORY) + BACK HANDLING
============================================ */

function openBookModal(book) {
  // Push a state for the modal so back can close it
  if (window.history && window.history.pushState) {
    history.pushState({ screen: "bookModal" }, "");
  }

  const cover = book.cover || "img/book.jpg";
  const stats = readStats[book.title] || { count: 0, lastRead: null };

  const tagsHtml =
    book.tags && book.tags.length
      ? `<div class="modal-section">
           <h4>Info</h4>
           <div class="tag-row">
             ${book.tags.map(t => `<span class="tag-chip">${t}</span>`).join("")}
           </div>
         </div>`
      : "";

  modalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${cover}" alt="" onerror="this.src='img/book.jpg';" />
      <div class="modal-book-main">
        <h3>${book.title}</h3>
        <p class="modal-author">by ${book.author}</p>
        <p class="modal-category">Category: ${book.category}</p>
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

    ${tagsHtml}

    <div class="modal-section">
      <h4>Reading stats</h4>
      <p>Last read: ${formatLastRead(stats.lastRead)}</p>
      <p>Times opened: ${stats.count}</p>
    </div>

    <div class="modal-section modal-actions">
      <a href="${book.viewLink}"
         target="_blank"
         class="modal-btn"
         data-role="read-link"
         data-title="${book.title}">
         <i class="fa-solid fa-book-open"></i>
         <span>Read</span>
      </a>
      <a href="${book.downloadLink}"
         target="_blank"
         class="modal-btn">
         <i class="fa-solid fa-download"></i>
         <span>Download</span>
      </a>
    </div>
  `;

  bookModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeBookModal() {
  bookModal.classList.add("hidden");
  document.body.style.overflow = "";
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
        cat === "all"
          ? "All"
          : cat === "bookmarked"
          ? "Bookmarked"
          : cat;
      return `<button class="category-pill" data-cat="${cat}">${label}</button>`;
    })
    .join("");

  categoryModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCategoryModal() {
  categoryModal.classList.add("hidden");
  document.body.style.overflow = "";
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

/* Back button / navigation handler */

function handleBackNavigation() {
  // 1) If a book modal is open, close it instead of leaving
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

  // 3) If not on home screen, go to home instead of leaving the app
  if (!isOnHomeScreen()) {
    changeCategory("all");
    if (window.history && window.history.replaceState) {
      history.replaceState({ screen: "home" }, "");
    }
    return;
  }

  // 4) Already on home -> ask once before leaving the app
  if (!exitConfirmShown) {
    const leave = window.confirm("Do you want to leave the library app?");
    if (leave) {
      window.removeEventListener("popstate", handleBackNavigation);
      if (window.history && window.history.back) {
        history.back();
      }
    } else {
      exitConfirmShown = true; // don't ask again
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
  }
});

/* ============================================
   10. RENDER BOOKS + PAGINATION
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
           data-role="read-link"
           data-title="${book.title}">
           <i class="fa-solid fa-book-open"></i>
           <span>Read</span>
        </a>
        <a href="${book.downloadLink}"
           target="_blank">
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
      if (e.target.closest(".book-links") || e.target.closest(".bookmark-btn")) return;
      openBookModal(book);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================
   11. SEARCH, CLEAR, SORT
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
   12. PAGINATION CONTROLS
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
   13. READ LINK TRACKING
============================================ */

booksContainer.addEventListener("click", e => {
  const link = e.target.closest("[data-role='read-link']");
  if (!link) return;
  const title = link.dataset.title;
  if (title) recordRead(title);
});

modalBody.addEventListener("click", e => {
  const link = e.target.closest("[data-role='read-link']");
  if (!link) return;
  const title = link.dataset.title;
  if (title) recordRead(title);
});

/* ============================================
   14. MOBILE BOTTOM NAV
============================================ */

mobileBottomNav.addEventListener("click", e => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;

  // If any popup is open, ignore nav taps
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
   15. INITIALIZE
============================================ */

loadBooksFromSheet();
