/* ============================================
   Library App - Dark Neon Version (no light mode)
============================================ */

/* 1. GOOGLE SHEET CONFIG */
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

/* 2. STATE */
let allBooks = [];        // all books mapped from sheet
let categories = [];      // array of category names
let bookmarks = [];       // bookmark keys (title__author) from localStorage

let currentCategory = "All"; // category name or "All" or "__bookmarks__"
let searchQuery = "";
let advTitle = "";
let advAuthor = "";
let advTags = "";
let advCategory = "";
let sortOption = "title-asc";
let currentPage = 1;
const PAGE_SIZE = 30;

/* 3. DOM ELEMENTS */
const searchInput = document.getElementById("searchInput");
const clearSearchButton = document.getElementById("clearSearchButton");
const advancedSearchButton = document.getElementById("advancedSearchButton");

const categoriesRow = document.getElementById("categoriesRow");
const sortSelect = document.getElementById("sortSelect");
const statsEl = document.getElementById("stats");

const booksGrid = document.getElementById("booksGrid");
const emptyStateEl = document.getElementById("emptyState");
const resetFiltersButton = document.getElementById("resetFiltersButton");
const paginationEl = document.getElementById("pagination");

/* Modal */
const bookModal = document.getElementById("bookModal");
const modalCoverImg = document.getElementById("modalCover");
const modalTitleEl = document.getElementById("modalTitle");
const modalAuthorEl = document.getElementById("modalAuthor");
const modalMetaEl = document.getElementById("modalMeta");
const modalDescriptionEl = document.getElementById("modalDescription");
const modalTagsEl = document.getElementById("modalTags");
const modalPdfButton = document.getElementById("modalPdfButton");
const modalBookmarkButton = document.getElementById("modalBookmarkButton");
const modalCloseButton = document.getElementById("modalCloseButton");

/* Advanced search overlay (if present) */
const searchOverlay = document.getElementById("searchOverlay");
const advTitleInput = document.getElementById("advTitleInput");
const advAuthorInput = document.getElementById("advAuthorInput");
const advTagsInput = document.getElementById("advTagsInput");
const advCategoryInput = document.getElementById("advCategoryInput");
const advApplyButton = document.getElementById("advApplyButton");
const advResetButton = document.getElementById("advResetButton");
const advCloseButton = document.getElementById("advCloseButton");

/* Bottom nav (mobile) */
const bottomNav = document.querySelector(".mobile-bottom-nav");

/* currently open book in modal */
let currentModalBook = null;

/* ============================================
   LOCAL STORAGE HELPERS (BOOKMARKS / BOOK CACHE)
============================================ */

const BOOKS_CACHE_KEY = "libraryBooksCache";
const BOOKMARKS_KEY = "libraryBookmarks";

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) {
      bookmarks = [];
      return;
    }
    const parsed = JSON.parse(raw);
    bookmarks = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to parse bookmarks", e);
    bookmarks = [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch (e) {
    console.warn("Failed to save bookmarks", e);
  }
}

function getBookmarkKey(book) {
  return `${book.title}__${book.author}`;
}

function isBookBookmarked(book) {
  const key = getBookmarkKey(book);
  return bookmarks.includes(key);
}

function toggleBookmark(book) {
  const key = getBookmarkKey(book);
  if (bookmarks.includes(key)) {
    bookmarks = bookmarks.filter(k => k !== key);
  } else {
    bookmarks.push(key);
  }
  saveBookmarks();
}

function loadBooksFromCache() {
  try {
    const raw = localStorage.getItem(BOOKS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return null;
  } catch (e) {
    console.warn("Failed to parse book cache", e);
    return null;
  }
}

function saveBooksToCache(rows) {
  try {
    localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(rows));
  } catch (e) {
    console.warn("Failed to cache books", e);
  }
}

/* ============================================
   DATA MAPPING & TAG PARSING
============================================ */

function normalize(str) {
  return (str || "").toString().trim();
}

function lower(str) {
  return normalize(str).toLowerCase();
}

/**
 * From tags like ["PDF", "10 MB", "150 PAGES"],
 * extract sizeMb (number) and pages (number).
 */
function parseFileInfoFromTags(tags) {
  let sizeMb = null;
  let pages = null;

  if (!Array.isArray(tags)) return { sizeMb, pages };

  tags.forEach(tag => {
    const t = lower(tag);
    // size MB
    if (t.includes("mb")) {
      const match = t.match(/([\d.,]+)/);
      if (match) {
        const num = parseFloat(match[1].replace(",", "."));
        if (!isNaN(num)) sizeMb = num;
      }
    }
    // pages
    if (t.includes("page")) {
      const match = t.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) pages = num;
      }
    }
  });

  return { sizeMb, pages };
}

/**
 * Convert one Google Sheet row into a book object
 */
function mapRowToBook(row) {
  const title = normalize(row.title);
  const author = normalize(row.author);
  const category = normalize(row.category || "Other");
  const description = normalize(row.description);
  const details = normalize(row.details);
  const rawTags = normalize(row.tags);
  const pdfUrl =
    normalize(row.pdfurl || row.pdf || row.link || row.url || row["PDF URL"]);

  const tags = rawTags
    ? rawTags.split(",").map(t => normalize(t)).filter(Boolean)
    : [];

  const { sizeMb, pages } = parseFileInfoFromTags(tags);

  let cover = normalize(row.cover || row.image || row.thumbnail);
  if (!cover) {
    cover = "img/book.jpg"; // default cover
  }

  return {
    title,
    author,
    category,
    description,
    details,
    tags,
    pdfUrl,
    cover,
    sizeMb,
    pages
  };
}

/* ============================================
   LOADING FROM SHEET
============================================ */

function applyBooks(rows) {
  allBooks = rows
    .map(mapRowToBook)
    .filter(b => b.title && b.author);

  // categories list
  const set = new Set();
  allBooks.forEach(b => {
    if (b.category) set.add(b.category);
  });
  categories = Array.from(set).sort((a, b) => a.localeCompare(b));

  renderCategories();
  setSortOptions();
  currentPage = 1;
  updateView();
}

function loadBooks() {
  const cached = loadBooksFromCache();
  if (cached) {
    applyBooks(cached);
  }

  fetch(SHEET_URL)
    .then(res => res.json())
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) return;
      saveBooksToCache(rows);
      applyBooks(rows);
    })
    .catch(err => {
      console.error("Error fetching sheet data:", err);
      if (!cached && booksGrid) {
        booksGrid.innerHTML =
          "<p>Unable to load books. Please check your internet connection.</p>";
      }
    });
}

/* ============================================
   CATEGORIES
============================================ */

function renderCategories() {
  if (!categoriesRow) return;
  categoriesRow.innerHTML = "";

  // "All" button
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className =
    "category-pill" + (currentCategory === "All" ? " active" : "");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    setCategory("All");
  });
  categoriesRow.appendChild(allBtn);

  // "Bookmarks" special
  const bookmarksBtn = document.createElement("button");
  bookmarksBtn.type = "button";
  bookmarksBtn.className =
    "category-pill" + (currentCategory === "__bookmarks__" ? " active" : "");
  bookmarksBtn.textContent = "Bookmarks";
  bookmarksBtn.addEventListener("click", () => {
    setCategory("__bookmarks__");
  });
  categoriesRow.appendChild(bookmarksBtn);

  // All categories from sheet
  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "category-pill" + (currentCategory === cat ? " active" : "");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      setCategory(cat);
    });
    categoriesRow.appendChild(btn);
  });
}

function setCategory(cat) {
  currentCategory = cat;
  currentPage = 1;
  renderCategories();
  updateView();
}

/* ============================================
   SORTING
============================================ */

function setSortOptions() {
  if (!sortSelect) return;
  sortSelect.innerHTML = "";

  const options = [
    { value: "title-asc", label: "Title (A–Z)" },
    { value: "title-desc", label: "Title (Z–A)" },
    { value: "author-asc", label: "Author (A–Z)" },
    { value: "author-desc", label: "Author (Z–A)" },
    { value: "size-asc", label: "Size (MB) ↑" },
    { value: "size-desc", label: "Size (MB) ↓" },
    { value: "pages-asc", label: "Pages ↑" },
    { value: "pages-desc", label: "Pages ↓" }
  ];

  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sortSelect.appendChild(opt);
  });

  sortSelect.value = sortOption;
}

/* ============================================
   FILTER + SORT PIPELINE
============================================ */

function applyFiltersAndSort() {
  let list = allBooks.slice();

  // Category
  if (currentCategory === "__bookmarks__") {
    list = list.filter(isBookBookmarked);
  } else if (currentCategory !== "All") {
    const cat = lower(currentCategory);
    list = list.filter(b => lower(b.category) === cat);
  }

  // Basic search
  const q = lower(searchQuery);
  if (q) {
    list = list.filter(b => {
      const haystack = `${b.title} ${b.author} ${b.category} ${b.description} ${b.details} ${(b.tags || []).join(" ")}`;
      return lower(haystack).includes(q);
    });
  }

  // Advanced search
  if (advTitle) {
    const t = lower(advTitle);
    list = list.filter(b => lower(b.title).includes(t));
  }
  if (advAuthor) {
    const a = lower(advAuthor);
    list = list.filter(b => lower(b.author).includes(a));
  }
  if (advTags) {
    const tagsNeedle = advTags
      .split(",")
      .map(s => lower(s))
      .filter(Boolean);
    if (tagsNeedle.length) {
      list = list.filter(b => {
        const joined = (b.tags || []).map(lower).join(" ");
        return tagsNeedle.every(t => joined.includes(t));
      });
    }
  }
  if (advCategory) {
    const c = lower(advCategory);
    list = list.filter(b => lower(b.category).includes(c));
  }

  // Sorting
  list.sort((a, b) => {
    switch (sortOption) {
      case "title-asc":
        return a.title.localeCompare(b.title);
      case "title-desc":
        return b.title.localeCompare(a.title);
      case "author-asc":
        return a.author.localeCompare(b.author);
      case "author-desc":
        return b.author.localeCompare(a.author);
      case "size-asc": {
        const av = a.sizeMb ?? Infinity;
        const bv = b.sizeMb ?? Infinity;
        return av - bv;
      }
      case "size-desc": {
        const av = a.sizeMb ?? 0;
        const bv = b.sizeMb ?? 0;
        return bv - av;
      }
      case "pages-asc": {
        const av = a.pages ?? Infinity;
        const bv = b.pages ?? Infinity;
        return av - bv;
      }
      case "pages-desc": {
        const av = a.pages ?? 0;
        const bv = b.pages ?? 0;
        return bv - av;
      }
      default:
        return a.title.localeCompare(b.title);
    }
  });

  return list;
}

function getPaginatedBooks() {
  const filtered = applyFiltersAndSort();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filtered.slice(start, end);

  renderPagination(totalPages, total);

  return pageItems;
}

/* ============================================
   RENDERING
============================================ */

function renderBooksGrid() {
  if (!booksGrid) return;

  const pageBooks = getPaginatedBooks();

  if (!pageBooks.length) {
    booksGrid.innerHTML = "";
    if (emptyStateEl) emptyStateEl.classList.remove("hidden");
    return;
  }

  if (emptyStateEl) emptyStateEl.classList.add("hidden");

  const fragment = document.createDocumentFragment();

  pageBooks.forEach(book => {
    const card = document.createElement("article");
    card.className = "book-card";

    const bookmarked = isBookBookmarked(book);

    // Build HTML
    const tagsHtml = (book.tags || [])
      .map(tag => `<span class="tag-chip">${tag}</span>`)
      .join("");

    const hasPdf = !!book.pdfUrl;

    card.innerHTML = `
      <button class="bookmark-toggle" type="button" aria-label="Toggle bookmark">
        <i class="${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
      </button>
      <div class="book-cover">
        <img src="${book.cover}" alt="${book.title}" loading="lazy">
      </div>
      <h3 class="book-title">${book.title}</h3>
      <p class="book-author">${book.author}</p>
      <p class="book-category-label">${book.category}</p>
      <div class="book-tags">
        ${tagsHtml}
      </div>
      <div class="book-links">
        <a href="javascript:void(0)" class="details-link">
          <i class="fa-solid fa-circle-info"></i>
          Details
        </a>
        ${
          hasPdf
            ? `<a href="${book.pdfUrl}" target="_blank" rel="noopener" class="pdf-link">
                 <i class="fa-solid fa-file-pdf"></i>
                 Get PDF
               </a>`
            : ""
        }
      </div>
    `;

    // Bookmark button
    const bookmarkBtn = card.querySelector(".bookmark-toggle");
    bookmarkBtn.addEventListener("click", e => {
      e.stopPropagation();
      toggleBookmark(book);
      updateView();
    });

    // Details link
    const detailsLink = card.querySelector(".details-link");
    detailsLink.addEventListener("click", e => {
      e.stopPropagation();
      openBookModal(book);
    });

    // clicking card also opens modal
    card.addEventListener("click", e => {
      // avoid double firing from bookmark/details
      if (
        e.target.closest(".bookmark-toggle") ||
        e.target.closest(".details-link") ||
        e.target.closest(".pdf-link")
      ) {
        return;
      }
      openBookModal(book);
    });

    fragment.appendChild(card);
  });

  booksGrid.innerHTML = "";
  booksGrid.appendChild(fragment);
}

function renderPagination(totalPages, totalItems) {
  if (!paginationEl) return;
  paginationEl.innerHTML = "";

  if (totalPages <= 1) {
    // show stats only
    if (statsEl) {
      statsEl.textContent = `${totalItems} books`;
    }
    return;
  }

  if (statsEl) {
    statsEl.textContent = `${totalItems} books · Page ${currentPage}/${totalPages}`;
  }

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Prev";
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      updateView();
    }
  });

  const infoSpan = document.createElement("span");
  infoSpan.textContent = `Page ${currentPage} / ${totalPages}`;

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateView();
    }
  });

  paginationEl.appendChild(prevBtn);
  paginationEl.appendChild(infoSpan);
  paginationEl.appendChild(nextBtn);
}

/* ============================================
   MODAL
============================================ */

function openModal(modal) {
  if (!modal) return;
  modal.classList.add("show");
  document.body.classList.add("popup-open");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("show");
  document.body.classList.remove("popup-open");
}

function openBookModal(book) {
  currentModalBook = book;
  if (!bookModal) return;

  if (modalCoverImg) {
    modalCoverImg.src = book.cover;
    modalCoverImg.alt = book.title;
  }
  if (modalTitleEl) modalTitleEl.textContent = book.title;
  if (modalAuthorEl) modalAuthorEl.textContent = book.author;

  // meta: category + size + pages + details
  const metaParts = [];
  if (book.category) metaParts.push(book.category);
  if (book.sizeMb != null) metaParts.push(`${book.sizeMb} MB`);
  if (book.pages != null) metaParts.push(`${book.pages} pages`);
  if (book.details) metaParts.push(book.details);
  if (modalMetaEl) {
    modalMetaEl.textContent = metaParts.join(" • ");
  }

  if (modalDescriptionEl) {
    modalDescriptionEl.textContent =
      book.description || "No description available.";
  }

  if (modalTagsEl) {
    modalTagsEl.innerHTML = (book.tags || [])
      .map(t => `<span class="tag-chip">${t}</span>`)
      .join("");
  }

  // PDF button
  if (modalPdfButton) {
    if (book.pdfUrl) {
      modalPdfButton.disabled = false;
      modalPdfButton.classList.remove("hidden");
    } else {
      modalPdfButton.disabled = true;
      modalPdfButton.classList.add("hidden");
    }
  }

  // Bookmark button text + icon
  if (modalBookmarkButton) {
    const bookmarked = isBookBookmarked(book);
    modalBookmarkButton.innerHTML = `
      <i class="${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
      ${bookmarked ? "Remove bookmark" : "Bookmark"}
    `;
  }

  openModal(bookModal);
}

/* ============================================
   UPDATE VIEW
============================================ */

function updateView() {
  renderBooksGrid();
}

/* ============================================
   EVENT HANDLERS
============================================ */

function initEvents() {
  // search input
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      currentPage = 1;
      updateView();
    });
  }

  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      currentPage = 1;
      advTitle = advAuthor = advTags = advCategory = "";
      updateView();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      sortOption = sortSelect.value;
      currentPage = 1;
      updateView();
    });
  }

  // reset filters (empty state button)
  if (resetFiltersButton) {
    resetFiltersButton.addEventListener("click", () => {
      currentCategory = "All";
      searchQuery = "";
      advTitle = advAuthor = advTags = advCategory = "";
      currentPage = 1;
      if (searchInput) searchInput.value = "";
      renderCategories();
      updateView();
    });
  }

  // modal close (X and overlay and close button)
  if (bookModal) {
    const overlay = bookModal.querySelector(".modal-overlay");
    const closeBtn = bookModal.querySelector(".modal-close");

    if (overlay) {
      overlay.addEventListener("click", () => closeModal(bookModal));
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeModal(bookModal));
    }
    if (modalCloseButton) {
      modalCloseButton.addEventListener("click", () => closeModal(bookModal));
    }
  }

  // modal Get PDF
  if (modalPdfButton) {
    modalPdfButton.addEventListener("click", () => {
      if (!currentModalBook || !currentModalBook.pdfUrl) return;
      window.open(currentModalBook.pdfUrl, "_blank", "noopener");
    });
  }

  // modal bookmark
  if (modalBookmarkButton) {
    modalBookmarkButton.addEventListener("click", () => {
      if (!currentModalBook) return;
      toggleBookmark(currentModalBook);
      // refresh modal button + cards
      openBookModal(currentModalBook);
      updateView();
    });
  }

  // advanced search overlay (if present)
  if (advancedSearchButton && searchOverlay) {
    advancedSearchButton.addEventListener("click", () => {
      openModal(searchOverlay);
    });
  }

  if (searchOverlay) {
    const overlay = searchOverlay.querySelector(".modal-overlay");
    const closeBtn = searchOverlay.querySelector(".modal-close");

    if (overlay) overlay.addEventListener("click", () => closeModal(searchOverlay));
    if (closeBtn) closeBtn.addEventListener("click", () => closeModal(searchOverlay));
  }

  if (advApplyButton) {
    advApplyButton.addEventListener("click", () => {
      advTitle = advTitleInput ? advTitleInput.value.trim() : "";
      advAuthor = advAuthorInput ? advAuthorInput.value.trim() : "";
      advTags = advTagsInput ? advTagsInput.value.trim() : "";
      advCategory = advCategoryInput ? advCategoryInput.value.trim() : "";
      currentPage = 1;
      if (searchOverlay) closeModal(searchOverlay);
      updateView();
    });
  }

  if (advResetButton) {
    advResetButton.addEventListener("click", () => {
      advTitle = advAuthor = advTags = advCategory = "";
      if (advTitleInput) advTitleInput.value = "";
      if (advAuthorInput) advAuthorInput.value = "";
      if (advTagsInput) advTagsInput.value = "";
      if (advCategoryInput) advCategoryInput.value = "";
      currentPage = 1;
      updateView();
    });
  }

  if (advCloseButton) {
    advCloseButton.addEventListener("click", () => {
      if (searchOverlay) closeModal(searchOverlay);
    });
  }

  // bottom nav (mobile)
  if (bottomNav) {
    const buttons = bottomNav.querySelectorAll("button[data-nav]");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const nav = btn.getAttribute("data-nav");
        buttons.forEach(b => b.classList.remove("nav-active"));
        btn.classList.add("nav-active");

        if (nav === "home") {
          currentCategory = "All";
          currentPage = 1;
          renderCategories();
          updateView();
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (nav === "bookmarks") {
          setCategory("__bookmarks__");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (nav === "categories") {
          const catSection = document.getElementById("controlsRow");
          if (catSection) {
            catSection.scrollIntoView({ behavior: "smooth" });
          }
        } else if (nav === "search") {
          if (searchOverlay) {
            openModal(searchOverlay);
          } else if (searchInput) {
            searchInput.focus();
          }
        }
      });
    });
  }
}

/* ============================================
   INIT
============================================ */

function init() {
  loadBookmarks();
  loadBooks();
  initEvents();
}

document.addEventListener("DOMContentLoaded", init);
