/* ============================================
   Library App - UI Refresh Version (Option B)
   - Google Sheet data source
   - Search, categories, bookmarks, pagination
   - Dark / light theme with CSS variables
============================================ */

/* 1. GOOGLE SHEET CONFIG */
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

/* 2. STATE */
let allBooks = [];          // all books loaded from sheet
let categories = [];        // list of { name, count }
let bookmarks = [];         // array of bookmark keys
let currentCategory = "all";
let searchQuery = "";
let sortOption = "title-asc";
let currentPage = 1;
const PAGE_SIZE = 40;

// advanced search fields
let advTitle = "";
let advAuthor = "";
let advTags = "";
let advCategory = "";

/* 3. DOM REFERENCES */
const booksGrid = document.getElementById("booksGrid");
const totalBooksCountEl = document.getElementById("totalBooksCount");
const visibleBooksCountEl = document.getElementById("visibleBooksCount");

const searchInput = document.getElementById("searchInput");
const searchClearBtn = document.getElementById("searchClearBtn");
const advancedSearchBtn = document.getElementById("advancedSearchBtn");

const chipRow = document.querySelector(".chip-row");
const viewAllCategoriesBtn = document.getElementById("viewAllCategoriesBtn");
const categoriesListEl = document.getElementById("categoriesList");

const sortSelect = document.getElementById("sortSelect");
const emptyStateEl = document.getElementById("emptyState");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const paginationEl = document.getElementById("pagination");

const bookModal = document.getElementById("bookModal");
const modalBookCover = document.getElementById("modalBookCover");
const modalBookTitle = document.getElementById("modalBookTitle");
const modalBookAuthor = document.getElementById("modalBookAuthor");
const modalBookMeta = document.getElementById("modalBookMeta");
const modalBookDescription = document.getElementById("modalBookDescription");
const modalBookTags = document.getElementById("modalBookTags");
const modalBookmarkBtn = document.getElementById("modalBookmarkBtn");

const categoriesModal = document.getElementById("categoriesModal");
const searchOverlay = document.getElementById("searchOverlay");

const advancedSearchForm = document.getElementById("advancedSearchForm");
const advTitleInput = document.getElementById("advTitleInput");
const advAuthorInput = document.getElementById("advAuthorInput");
const advTagsInput = document.getElementById("advTagsInput");
const advCategoryInput = document.getElementById("advCategoryInput");
const advancedSearchResetBtn = document.getElementById("advancedSearchResetBtn");

const navHomeBtn = document.getElementById("navHomeBtn");
const navSearchBtn = document.getElementById("navSearchBtn");
const navBookmarksBtn = document.getElementById("navBookmarksBtn");
const navCategoriesBtn = document.getElementById("navCategoriesBtn");

const themeToggle = document.getElementById("themeToggle");
const metaThemeColor = document.getElementById("meta-theme-color");

/* helper to find closest modal root */
function getModalRoot(child) {
  return child.closest(".modal");
}

/* ============================================
   THEME HANDLING
============================================ */
function applyTheme(theme) {
  const root = document.documentElement;
  const normalized = theme === "light" ? "light" : "dark";

  root.setAttribute("data-theme", normalized);
  localStorage.setItem("theme", normalized);

  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      "content",
      normalized === "dark" ? "#0b1220" : "#f9fafb"
    );
  }

  if (themeToggle) {
    themeToggle.innerHTML =
      normalized === "dark"
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
  }
}

function initTheme() {
  const stored = localStorage.getItem("theme");
  applyTheme(stored || "dark");
}

/* ============================================
   BOOK & CATEGORY HELPERS
============================================ */
function normalize(str) {
  return (str || "").toString().toLowerCase();
}

// Key used for bookmarks (title + author)
function getBookmarkKey(book) {
  return `${book.title}__${book.author}`;
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem("bookmarks");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        bookmarks = parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse bookmarks from storage", e);
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  } catch (e) {
    console.warn("Failed to save bookmarks", e);
  }
}

function isBookBookmarked(book) {
  return bookmarks.includes(getBookmarkKey(book));
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

/* convert Google Sheet row to book object */
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

  // URL for PDF or external link
  const pdfUrl = (row.pdfurl || row.pdf || row.url || "").trim();

  const coverRaw = (row.cover || "").trim();
  let cover = coverRaw;
  if (!cover) {
    cover = "img/book.jpg";
  } else if (
    !cover.startsWith("http://") &&
    !cover.startsWith("https://")
  ) {
    // treat as local/relative
    cover = cover;
  }

  return {
    title,
    author,
    category,
    description,
    details,
    tags,
    pdfUrl,
    cover
  };
}

/* ============================================
   LOADING BOOKS (SHEET + CACHE)
============================================ */
function applyBooks(rows) {
  allBooks = rows
    .map(mapRowToBook)
    .filter(b => b.title && b.author);

  // build categories
  const counts = {};
  allBooks.forEach(b => {
    const key = b.category || "Other";
    counts[key] = (counts[key] || 0) + 1;
  });
  categories = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map(name => ({ name, count: counts[name] }));

  renderTopCategories();
  renderCategoriesModal();

  if (totalBooksCountEl) {
    totalBooksCountEl.textContent = String(allBooks.length);
  }

  currentPage = 1;
  updateView();
}

function loadBooksFromCache() {
  try {
    const raw = localStorage.getItem("booksCache");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed;
    }
  } catch (e) {
    console.warn("Failed to parse books cache", e);
  }
  return null;
}

function saveBooksToCache(rows) {
  try {
    localStorage.setItem("booksCache", JSON.stringify(rows));
  } catch (e) {
    console.warn("Failed to cache books", e);
  }
}

function loadBooks() {
  const cached = loadBooksFromCache();
  if (cached) {
    applyBooks(cached);
  }

  // always try to fetch latest
  fetch(SHEET_URL)
    .then(res => res.json())
    .then(rows => {
      if (Array.isArray(rows) && rows.length) {
        saveBooksToCache(rows);
        applyBooks(rows);
      }
    })
    .catch(err => {
      console.error("Failed to fetch sheet", err);
      if (!cached && booksGrid) {
        booksGrid.innerHTML =
          "<p>Unable to load books. Please check your connection.</p>";
      }
    });
}

/* ============================================
   FILTERING, SORTING, PAGINATION
============================================ */
function applyFiltersAndSort() {
  let list = allBooks.slice();

  // category filter
  if (currentCategory === "__bookmarks__") {
    list = list.filter(isBookBookmarked);
  } else if (currentCategory !== "all") {
    const catNorm = normalize(currentCategory);
    list = list.filter(b => normalize(b.category) === catNorm);
  }

  // basic search
  const q = normalize(searchQuery);
  if (q) {
    list = list.filter(b => {
      const haystack =
        `${b.title} ${b.author} ${b.category} ${b.description} ${(b.tags || []).join(" ")}`;
      return haystack.toLowerCase().includes(q);
    });
  }

  // advanced search
  if (advTitle) {
    const t = normalize(advTitle);
    list = list.filter(b => normalize(b.title).includes(t));
  }
  if (advAuthor) {
    const a = normalize(advAuthor);
    list = list.filter(b => normalize(b.author).includes(a));
  }
  if (advTags) {
    const parts = advTags
      .split(",")
      .map(p => normalize(p.trim()))
      .filter(Boolean);
    if (parts.length) {
      list = list.filter(b => {
        const joined = (b.tags || []).map(normalize).join(" ");
        return parts.every(p => joined.includes(p));
      });
    }
  }
  if (advCategory) {
    const c = normalize(advCategory);
    list = list.filter(b => normalize(b.category).includes(c));
  }

  // sort
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
      default:
        return a.title.localeCompare(b.title);
    }
  });

  return list;
}

function getPaginatedBooks() {
  const filtered = applyFiltersAndSort();

  if (visibleBooksCountEl) {
    visibleBooksCountEl.textContent = String(filtered.length);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filtered.slice(start, end);

  renderPagination(totalPages);

  return pageItems;
}

/* ============================================
   RENDERING
============================================ */
function renderBooksGrid() {
  if (!booksGrid) return;

  const booksToShow = getPaginatedBooks();

  if (!booksToShow.length) {
    booksGrid.innerHTML = "";
    if (emptyStateEl) emptyStateEl.hidden = false;
    return;
  }

  if (emptyStateEl) emptyStateEl.hidden = true;

  const fragment = document.createDocumentFragment();

  booksToShow.forEach(book => {
    const card = document.createElement("article");
    card.className = "book-card";

    const bookmarked = isBookBookmarked(book);

    card.innerHTML = `
      <div class="book-card-cover">
        <img src="${book.cover}" alt="${book.title}" loading="lazy" />
      </div>
      <div class="book-card-body">
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">${book.author}</p>
        <p class="book-category">${book.category || ""}</p>
        <div class="book-tags">
          ${(book.tags || [])
            .slice(0, 3)
            .map(t => `<span class="tag">${t}</span>`)
            .join("")}
        </div>
      </div>
      <button class="book-card-bookmark" type="button" aria-label="Toggle bookmark">
        <i class="${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
      </button>
    `;

    // click anywhere on card except bookmark button -> open modal
    const bookmarkBtn = card.querySelector(".book-card-bookmark");
    bookmarkBtn.addEventListener("click", evt => {
      evt.stopPropagation();
      toggleBookmark(book);
      // re-render to update icons & counts
      updateView();
    });

    card.addEventListener("click", () => {
      openBookModal(book);
    });

    fragment.appendChild(card);
  });

  booksGrid.innerHTML = "";
  booksGrid.appendChild(fragment);
}

function renderPagination(totalPages) {
  if (!paginationEl) return;
  paginationEl.innerHTML = "";

  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "Prev";
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      updateView();
    }
  });

  const infoSpan = document.createElement("span");
  infoSpan.textContent = `Page ${currentPage} of ${totalPages}`;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "Next";
  nextBtn.disabled = currentPage >= totalPages;
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

function renderTopCategories() {
  if (!chipRow) return;

  // keep the "All" + "More" buttons, remove dynamic chips in between
  const allBtn = chipRow.querySelector("[data-category='all']");
  const moreBtn = document.getElementById("viewAllCategoriesBtn");

  chipRow.innerHTML = "";
  if (allBtn) chipRow.appendChild(allBtn);
  if (moreBtn) chipRow.appendChild(moreBtn);

  // top 5 categories
  const top = categories.slice(0, 5);
  top.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-chip";
    btn.dataset.category = cat.name;
    btn.textContent = `${cat.name} (${cat.count})`;
    btn.addEventListener("click", () => {
      setCategory(cat.name);
    });

    chipRow.insertBefore(btn, moreBtn || null);
  });

  // wire All chip again (in case DOM lost events)
  if (allBtn) {
    allBtn.classList.add("is-active");
    allBtn.addEventListener("click", () => {
      setCategory("all");
    });
  }
}

function renderCategoriesModal() {
  if (!categoriesListEl) return;
  categoriesListEl.innerHTML = "";

  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-chip";
    btn.dataset.category = cat.name;
    btn.textContent = `${cat.name} (${cat.count})`;
    btn.addEventListener("click", () => {
      setCategory(cat.name);
      closeModal(categoriesModal);
    });
    categoriesListEl.appendChild(btn);
  });
}

/* ============================================
   BOOK MODAL
============================================ */
let currentModalBook = null;

function openBookModal(book) {
  currentModalBook = book;

  if (modalBookCover) {
    modalBookCover.src = book.cover;
    modalBookCover.alt = book.title;
  }
  if (modalBookTitle) modalBookTitle.textContent = book.title;
  if (modalBookAuthor) modalBookAuthor.textContent = book.author;

  if (modalBookMeta) {
    const parts = [];
    if (book.category) parts.push(book.category);
    if (book.details) parts.push(book.details);
    modalBookMeta.textContent = parts.join(" • ");
  }

  if (modalBookDescription) {
    modalBookDescription.textContent = book.description || "No description available.";
  }

  if (modalBookTags) {
    modalBookTags.innerHTML = (book.tags || [])
      .map(t => `<span class="tag">${t}</span>`)
      .join("");
  }

  if (modalBookmarkBtn) {
    const bookmarked = isBookBookmarked(book);
    modalBookmarkBtn.innerHTML = `
      <i class="${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
      <span>${bookmarked ? "Remove bookmark" : "Bookmark"}</span>
    `;
  }

  openModal(bookModal);
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
}

/* ============================================
   EVENT WIRING
============================================ */
function setCategory(catName) {
  currentCategory = catName;
  currentPage = 1;

  // update active chips in quick row
  if (chipRow) {
    const chips = chipRow.querySelectorAll(".category-chip");
    chips.forEach(ch => {
      const c = ch.dataset.category || "";
      ch.classList.toggle(
        "is-active",
        c === catName || (catName === "all" && c === "all")
      );
    });
  }

  // update bookmarks nav state
  if (navBookmarksBtn) {
    navBookmarksBtn.classList.toggle("active", catName === "__bookmarks__");
  }

  updateView();
}

function setSearch(q) {
  searchQuery = q || "";
  currentPage = 1;
  updateView();
}

function updateView() {
  renderBooksGrid();
}

/* main init */
function init() {
  initTheme();
  loadBookmarks();
  loadBooks();

  // search box
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      setSearch(searchInput.value);
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      advTitle = advAuthor = advTags = advCategory = "";
      setSearch("");
    });
  }

  // sort
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      sortOption = sortSelect.value;
      currentPage = 1;
      updateView();
    });
  }

  // theme toggle
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const curr = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(curr === "dark" ? "light" : "dark");
    });
  }

  // reset filters
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      currentCategory = "all";
      searchQuery = "";
      advTitle = advAuthor = advTags = advCategory = "";
      currentPage = 1;

      if (searchInput) searchInput.value = "";
      if (chipRow) {
        const chips = chipRow.querySelectorAll(".category-chip");
        chips.forEach(ch => {
          const cat = ch.dataset.category || "";
          ch.classList.toggle("is-active", cat === "all");
        });
      }

      updateView();
    });
  }

  // view all categories (modal)
  if (viewAllCategoriesBtn) {
    viewAllCategoriesBtn.addEventListener("click", () => {
      openModal(categoriesModal);
    });
  }

  // modal close handlers (any element with data-modal-close attribute)
  document.addEventListener("click", evt => {
    const closeTarget = evt.target.closest("[data-modal-close]");
    if (closeTarget) {
      const modalId = closeTarget.getAttribute("data-modal-close");
      const modalEl = modalId
        ? document.getElementById(modalId)
        : getModalRoot(closeTarget);
      closeModal(modalEl);
    }
  });

  // click on overlay closes modal
  document.addEventListener("click", evt => {
    const overlay = evt.target.closest(".modal-overlay");
    if (overlay) {
      const modalRoot = getModalRoot(overlay);
      closeModal(modalRoot);
    }
  });

  // modal bookmark
  if (modalBookmarkBtn) {
    modalBookmarkBtn.addEventListener("click", () => {
      if (!currentModalBook) return;
      toggleBookmark(currentModalBook);
      openBookModal(currentModalBook); // re-render button state
      updateView(); // update cards
    });
  }

  // Advanced search
  if (advancedSearchBtn) {
    advancedSearchBtn.addEventListener("click", () => {
      openModal(searchOverlay);
    });
  }
  if (navSearchBtn) {
    navSearchBtn.addEventListener("click", () => {
      openModal(searchOverlay);
    });
  }

  if (advancedSearchForm) {
    advancedSearchForm.addEventListener("submit", evt => {
      evt.preventDefault();
      advTitle = advTitleInput.value.trim();
      advAuthor = advAuthorInput.value.trim();
      advTags = advTagsInput.value.trim();
      advCategory = advCategoryInput.value.trim();

      // optional: also put main search = title
      if (searchInput && advTitle) {
        searchInput.value = advTitle;
        searchQuery = advTitle;
      }

      currentPage = 1;
      closeModal(searchOverlay);
      updateView();
    });
  }

  if (advancedSearchResetBtn) {
    advancedSearchResetBtn.addEventListener("click", () => {
      advTitle = advAuthor = advTags = advCategory = "";
      advTitleInput.value = "";
      advAuthorInput.value = "";
      advTagsInput.value = "";
      advCategoryInput.value = "";
      currentPage = 1;
      updateView();
    });
  }

  // bottom nav
  if (navHomeBtn) {
    navHomeBtn.addEventListener("click", () => {
      currentCategory = "all";
      advTitle = advAuthor = advTags = advCategory = "";
      if (searchInput) searchInput.value = "";
      searchQuery = "";
      currentPage = 1;
      updateView();
    });
  }
  if (navBookmarksBtn) {
    navBookmarksBtn.addEventListener("click", () => {
      currentCategory = "__bookmarks__";
      currentPage = 1;
      updateView();
    });
  }
  if (navCategoriesBtn) {
    navCategoriesBtn.addEventListener("click", () => {
      openModal(categoriesModal);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
