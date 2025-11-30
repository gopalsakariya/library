/* ============================================================
   0. CONFIG – BACK TO OPENSHEET
============================================================ */

const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

/* ============================================================
   1. STATE + DOM
============================================================ */

const books = [];
let currentCategory = "all";
let currentSearch = "";
let currentSort = "relevance";
let currentSizeFilter = "any";
let currentPagesFilter = "any";
let currentView = "grid";

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

const booksContainer = document.getElementById("booksContainer");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const resultsInfo = document.getElementById("resultsInfo");

const categoriesRow = document.getElementById("categories");
const categoriesLeft = document.getElementById("categories-left");

const filtersModal = document.getElementById("filtersModal");
const filtersButton = document.getElementById("filtersButton");
const applyFiltersButton = document.getElementById("applyFiltersButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const sizeFilterSelect = document.getElementById("sizeFilter");
const pagesFilterSelect = document.getElementById("pagesFilter");

const sortInlineButton = document.getElementById("sortInlineButton");
let sortMenu = null;

const viewSwitch = document.getElementById("viewSwitch");
const viewButtons = viewSwitch
  ? viewSwitch.querySelectorAll(".view-btn")
  : [];

const bookModal = document.getElementById("bookModal");
const bookModalOverlay = bookModal.querySelector(".modal-overlay");
const bookModalClose = bookModal.querySelector(".modal-close");
const bookModalBody = bookModal.querySelector(".modal-body");

const themeToggle = document.getElementById("themeToggle");

/* ============================================================
   2. THEME TOGGLE (Dark / Light)
============================================================ */

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    if (themeToggle) themeToggle.innerHTML = '<i class="fa-regular fa-moon"></i>';
  } else {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    if (themeToggle) themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
  }
}

const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  });
}

/* ============================================================
   3. HELPERS
============================================================ */

function getCoverPath(rawCover) {
  const c = (rawCover || "").trim();
  if (!c) return "img/book.jpg";
  if (c.startsWith("http://") || c.startsWith("https://")) return c;
  return c; // relative path
}

function normalize(str) {
  return (str || "").toString().toLowerCase();
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
    (m) => `<mark>${m}</mark>`
  );
}

/* Soft scoring for relevance */
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

/* ============================================================
   4. MAP ROW -> BOOK  (OPEN SHEET)
============================================================ */

function mapRowToBook(row) {
  // OpenSheet gives keys exactly as your header; we assume lower-case
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

  // This is your "PDF, 10 MB, 150 Pages" style string
  const rawTags = (row.tags || "").trim();

  let tags = [];
  let format = "";
  let sizeMB = null;
  let pages = null;

  if (rawTags) {
    const parts = rawTags
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    tags = parts;

    parts.forEach((p) => {
      const lower = p.toLowerCase();

      if (!format) {
        if (lower === "pdf") format = "PDF";
        else if (lower === "epub") format = "EPUB";
        else if (lower === "mobi") format = "MOBI";
        else if (lower === "doc" || lower === "docx") format = "DOC";
      }

      const mbMatch = lower.match(/([\d.]+)\s*mb/);
      if (mbMatch) {
        const val = parseFloat(mbMatch[1]);
        if (!isNaN(val)) sizeMB = val;
      }

      const pagesMatch = lower.match(/(\d+)\s*pages?/);
      if (pagesMatch) {
        const val = parseInt(pagesMatch[1], 10);
        if (!isNaN(val)) pages = val;
      }
    });
  }

  // *** IMPORTANT: PDF URL COMES ONLY FROM PDF COLUMNS ***
  const pdfUrl = (
    row.pdfurl ||
    row.pdf ||
    row.url ||
    ""
  ).trim();

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

/* ============================================================
   5. LOAD FROM OPENSHEET
============================================================ */

function loadBooksFromSheet() {
  fetch(SHEET_URL)
    .then((res) => res.json())
    .then((rows) => {
      books.length = 0;
      rows.map(mapRowToBook).forEach((b) => books.push(b));
      renderTopCategories();
      renderBooks();
    })
    .catch((err) => {
      console.error("Error loading sheet:", err);
      booksContainer.innerHTML =
        "<p>Failed to load books. Please try again later.</p>";
    });
}

/* ============================================================
   6. CATEGORIES
============================================================ */

function getAllCategories() {
  const set = new Set(["all", "bookmarked"]);
  books.forEach((b) => set.add(b.category));
  return [...set];
}

function renderTopCategories() {
  if (!categoriesLeft) return;

  const cats = getAllCategories();

  categoriesLeft.innerHTML = cats
    .map((cat) => {
      const label =
        cat === "all"
          ? "All"
          : cat === "bookmarked"
          ? "Bookmarked"
          : cat;
      return `<button class="category-btn" data-category="${cat}">${label}</button>`;
    })
    .join("");

  categoriesLeft.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;
    const cat = btn.dataset.category || "all";
    changeCategory(cat);
  });

  updateCategoryActive();
}

function changeCategory(cat) {
  currentCategory = cat || "all";
  currentSearch = "";
  searchInput.value = "";
  updateCategoryActive();
  renderBooks();
}

function updateCategoryActive() {
  const btns = categoriesLeft.querySelectorAll(".category-btn");
  btns.forEach((btn) => {
    const c = btn.dataset.category || "all";
    btn.classList.toggle("active", c === currentCategory);
  });
}

/* ============================================================
   7. FILTERS (SIZE + PAGES ONLY)
============================================================ */

function updateFiltersButtonActive() {
  if (!filtersButton) return;
  const active =
    currentSizeFilter !== "any" || currentPagesFilter !== "any";
  filtersButton.classList.toggle("active", active);
}

function openFiltersModal() {
  filtersModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
}

function closeFiltersModal() {
  filtersModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

if (filtersButton) {
  filtersButton.addEventListener("click", openFiltersModal);
}

if (sizeFilterSelect) {
  sizeFilterSelect.addEventListener("change", () => {
    currentSizeFilter = sizeFilterSelect.value || "any";
    sizeFilterSelect.classList.toggle(
      "active-filter",
      currentSizeFilter !== "any"
    );
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
    updateFiltersButtonActive();
    renderBooks();
  });
}

if (clearFiltersButton) {
  clearFiltersButton.addEventListener("click", () => {
    currentSizeFilter = "any";
    currentPagesFilter = "any";
    if (sizeFilterSelect) {
      sizeFilterSelect.value = "any";
      sizeFilterSelect.classList.remove("active-filter");
    }
    if (pagesFilterSelect) {
      pagesFilterSelect.value = "any";
      pagesFilterSelect.classList.remove("active-filter");
    }
    updateFiltersButtonActive();
    renderBooks();
    closeFiltersModal();
  });
}

if (applyFiltersButton) {
  applyFiltersButton.addEventListener("click", () => {
    closeFiltersModal();
  });
}

if (filtersModal) {
  const overlay = filtersModal.querySelector(".modal-overlay");
  const closeBtn = filtersModal.querySelector(".modal-close");
  overlay.addEventListener("click", closeFiltersModal);
  closeBtn.addEventListener("click", closeFiltersModal);
}

/* ============================================================
   8. SORT DROPDOWN (ONLY CHANGE RELATED TO SORTING)
============================================================ */

function initSortDropdown() {
  if (!sortInlineButton) return;

  // Wrap button in a .sort-wrapper to match CSS
  const wrapper = document.createElement("div");
  wrapper.className = "sort-wrapper";

  const parent = sortInlineButton.parentNode;
  parent.insertBefore(wrapper, sortInlineButton);
  wrapper.appendChild(sortInlineButton);

  sortMenu = document.createElement("div");
  sortMenu.className = "sort-menu";
  wrapper.appendChild(sortMenu);

  const options = [
    { value: "relevance", label: "Relevance" },
    { value: "title", label: "Title (A–Z)" },
    { value: "author", label: "Author (A–Z)" },
    { value: "category", label: "Category (A–Z)" },
    { value: "sizeAsc", label: "Size (Small → Large)" },
    { value: "sizeDesc", label: "Size (Large → Small)" },
    { value: "pagesAsc", label: "Pages (Few → Many)" },
    { value: "pagesDesc", label: "Pages (Many → Few)" }
  ];

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sort-option";
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      currentSort = opt.value;
      updateSortActive();
      sortMenu.classList.remove("open");
      renderBooks();
    });
    sortMenu.appendChild(btn);
  });

  sortInlineButton.addEventListener("click", (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    sortMenu.classList.remove("open");
  });

  updateSortActive();
}

function updateSortActive() {
  if (!sortInlineButton || !sortMenu) return;
  const options = sortMenu.querySelectorAll(".sort-option");
  options.forEach((opt) => {
    const v = opt.dataset.value;
    opt.classList.toggle("active", v === currentSort);
  });
  sortInlineButton.classList.toggle("active", currentSort !== "relevance");
}

/* ============================================================
   9. SIZE / PAGES FILTER LOGIC
============================================================ */

function passesSizeFilter(book) {
  const mb = typeof book.sizeMB === "number" ? book.sizeMB : null;
  if (!mb && currentSizeFilter !== "any") return false;

  switch (currentSizeFilter) {
    case "lt1":
      return mb < 1;
    case "1to100":
      return mb >= 1 && mb <= 100;
    case "100to200":
      return mb >= 100 && mb <= 200;
    case "200to500":
      return mb >= 200 && mb <= 500;
    case "500to1000":
      return mb >= 500 && mb <= 1000;
    case "gt1000":
      return mb > 1000;
    default:
      return true;
  }
}

function passesPagesFilter(book) {
  const p = typeof book.pages === "number" ? book.pages : null;
  if (!p && currentPagesFilter !== "any") return false;

  switch (currentPagesFilter) {
    case "lt100":
      return p < 100;
    case "100to200":
      return p >= 100 && p <= 200;
    case "200to500":
      return p >= 200 && p <= 500;
    case "500to1000":
      return p >= 500 && p <= 1000;
    case "1000to2000":
      return p >= 1000 && p <= 2000;
    case "gt2000":
      return p > 2000;
    default:
      return true;
  }
}

/* ============================================================
   10. SEARCH / FILTER / SORT / VIEW PIPELINE
============================================================ */

function getFilteredAndSortedBooks() {
  const q = normalize(currentSearch);

  let items = books
    .map((book) => {
      // Category
      if (currentCategory === "bookmarked" && !bookmarks.includes(book.title)) {
        return { book, score: -1 };
      }
      if (
        currentCategory !== "all" &&
        currentCategory !== "bookmarked" &&
        normalize(book.category) !== normalize(currentCategory)
      ) {
        return { book, score: -1 };
      }

      // size & pages
      if (!passesSizeFilter(book)) return { book, score: -1 };
      if (!passesPagesFilter(book)) return { book, score: -1 };

      if (!q) return { book, score: 1 };

      const tagsText = book.tags && book.tags.length ? book.tags.join(" ") : "";

      const score =
        getMatchScore(book.title, q) * 3 +
        getMatchScore(book.author, q) * 2 +
        getMatchScore(book.category, q) * 2 +
        getMatchScore(book.description, q) +
        getMatchScore(tagsText, q) * 2;

      return { book, score };
    })
    .filter((x) => x.score > 0 || (!q && x.score === 1));

  // sorting
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

  return items.map((x) => x.book);
}

/* ============================================================
   11. RENDER BOOKS
============================================================ */

function renderBooks() {
  const items = getFilteredAndSortedBooks();
  const total = items.length;

  if (!currentSearch) {
    resultsInfo.textContent = "";
  } else if (!total) {
    resultsInfo.textContent = "0 results found.";
  } else {
    resultsInfo.textContent = `${total} result${total > 1 ? "s" : ""} found.`;
  }

  booksContainer.innerHTML = "";
  booksContainer.classList.toggle("list-view", currentView === "list");

  if (!total) {
    booksContainer.innerHTML = "<p>No books found.</p>";
    return;
  }

  items.forEach((book) => {
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
    bmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(book.title);
    });

    // NOTE: cover click does NOT open PDF – only opens popup
    card.addEventListener("click", () => {
      openBookModal(book);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================================
   12. BOOKMARKS
============================================================ */

function toggleBookmark(title) {
  if (bookmarks.includes(title)) {
    bookmarks = bookmarks.filter((t) => t !== title);
  } else {
    bookmarks.push(title);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks();
}

/* ============================================================
   13. BOOK MODAL (uses correct fields, correct PDF URL)
============================================================ */

function openBookModal(book) {
  const cover = book.cover || "img/book.jpg";

  const tagChips =
    book.tags && book.tags.length
      ? book.tags.map((t) => `<span class="tag-chip">${t}</span>`).join(" ")
      : "";

  bookModalBody.innerHTML = `
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

    <div class="modal-actions">
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
  document.body.classList.add("popup-open");

  const bookmarkToggleBtn = bookModalBody.querySelector("#bookmarkToggleBtn");
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

  // NO click on image → PDF here (removed on purpose)
}

function closeBookModal() {
  bookModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

bookModalClose.addEventListener("click", closeBookModal);
bookModalOverlay.addEventListener("click", closeBookModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !bookModal.classList.contains("hidden")) {
    closeBookModal();
  }
});

/* ============================================================
   14. VIEW SWITCH (Grid / List)
============================================================ */

viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view || "grid";
    currentView = view;
    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderBooks();
  });
});

/* ============================================================
   15. SEARCH
============================================================ */

searchButton.addEventListener("click", () => {
  currentSearch = searchInput.value.trim();
  renderBooks();
});

clearSearchButton.addEventListener("click", () => {
  currentSearch = "";
  searchInput.value = "";
  renderBooks();
});

searchInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    currentSearch = searchInput.value.trim();
    renderBooks();
  }
});

/* ============================================================
   16. INIT
============================================================ */

loadBooksFromSheet();
initSortDropdown();
updateFiltersButtonActive();
