/* ============================================
   1. GOOGLE SHEET CONFIG & BOOK STORAGE
============================================ */

// Your Google Sheet ID
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

// Books stored here
const books = [];
document.body.classList.add("dark");

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

// support both id="categoryList" and class="category-list"
const categoryList =
  document.getElementById("categoryList") ||
  document.querySelector(".category-list");

// support both id="mobileBottomNav" and class="mobile-bottom-nav"
const mobileBottomNav =
  document.getElementById("mobileBottomNav") ||
  document.querySelector(".mobile-bottom-nav");

const headerEl = document.querySelector("header");

let searchOverlay = null; // created lazily

/* ============================================
   3. STATE
============================================ */

let currentCategory = "home"; // "home" | "bookmarked" | category name
let currentSort = "relevance"; // "relevance" | "title" | "author" | "category"
let currentPage = 1;
const PAGE_SIZE = 12;

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

let historyInitialized = false;
let exitConfirmShown = false;
let firstDataApplied = false;

/* ============================================
   4. LOAD & CACHE
============================================ */

function cacheBooks(rows) {
  localStorage.setItem(
    "booksCache",
    JSON.stringify({
      timestamp: Date.now(),
      data: rows
    })
  );
}

function loadCachedBooks() {
  try {
    const cached = JSON.parse(localStorage.getItem("booksCache") || "null");
    if (!cached || !Array.isArray(cached.data)) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function applyBooksAndInit(mappedBooks) {
  books.length = 0;
  books.push(...mappedBooks);
  if (!firstDataApplied) {
    firstDataApplied = true;
    renderAll();
  } else {
    renderAll();
  }
}

/* Fetch from sheet with cache fallback */
async function loadBooks() {
  const cached = loadCachedBooks();
  if (cached && !firstDataApplied) {
    const mapped = cached.map(mapRowToBook);
    applyBooksAndInit(mapped);
  } else if (!firstDataApplied) {
    booksContainer.innerHTML = "<p>Loading books...</p>";
  }

  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error("Network response was not ok");
    const rows = await response.json();
    const mapped = rows.map(mapRowToBook);
    cacheBooks(rows);
    applyBooksAndInit(mapped);
  } catch (error) {
    console.error("Error fetching data from sheet:", error);
    if (!cached && !firstDataApplied) {
      booksContainer.innerHTML =
        "<p>Failed to load books. Check your internet connection and refresh.</p>";
    }
  }
}

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
   6. HELPERS
============================================ */

function normalize(str) {
  return (str || "").toString().toLowerCase();
}

/* Score for search relevance */
function scoreBookForSearch(book, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const title = normalize(book.title);
  const author = normalize(book.author);
  const category = normalize(book.category);
  const description = normalize(book.description);
  const tags = (book.tags || []).map(normalize);

  let score = 0;
  if (title.includes(q)) score += 5;
  if (author.includes(q)) score += 3;
  if (category.includes(q)) score += 2;
  tags.forEach((t) => {
    if (t.includes(q)) score += 2;
  });
  if (description.includes(q)) score += 1;

  return score;
}

/* Get current search query */
function getSearchQuery() {
  return (searchInput.value || "").trim();
}

/* Is book bookmarked? */
function isBookBookmarked(book) {
  return bookmarks.includes(book.title);
}

/* Toggle bookmark by title */
function toggleBookmark(title) {
  const index = bookmarks.indexOf(title);
  if (index === -1) {
    bookmarks.push(title);
  } else {
    bookmarks.splice(index, 1);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks();
}

/* Map sheet row -> book object
   LOWERCASE column names:
   title, author, category, cover, tags, description, details, pdfurl
*/
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

  const pdfUrl = (row.pdfurl || "").trim();
  const cover = getCoverPath(row.cover);

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

function initHistory() {
  if (historyInitialized) return;
  if (!window.history || !window.history.replaceState) return;
  historyInitialized = true;

  history.replaceState({ screen: "home" }, "");
  window.addEventListener("popstate", handleBackNavigation);
}

/* ============================================
   7. FILTER + SORT + PAGINATION
============================================ */

function getFilteredBooks() {
  const query = getSearchQuery();
  const normalizedQuery = normalize(query);

  let filtered = books.slice();

  if (currentCategory === "bookmarked") {
    filtered = filtered.filter(isBookBookmarked);
  } else if (currentCategory !== "home") {
    filtered = filtered.filter(
      (b) => normalize(b.category) === normalize(currentCategory)
    );
  }

  const scored = filtered.map((book) => ({
    book,
    score: scoreBookForSearch(book, normalizedQuery),
  }));

  const effective = normalizedQuery
    ? scored.filter((item) => item.score > 0)
    : scored;

  effective.sort((a, b) => {
    if (currentSort === "title") {
      return a.book.title.localeCompare(b.book.title);
    }
    if (currentSort === "author") {
      return a.book.author.localeCompare(b.book.author);
    }
    if (currentSort === "category") {
      return a.book.category.localeCompare(b.book.category);
    }

    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.book.title.localeCompare(b.book.title);
  });

  return effective.map((item) => item.book);
}

function getPagedBooks(allBooks) {
  const total = allBooks.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > maxPage) currentPage = maxPage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = allBooks.slice(start, end);

  return { pageItems, total, maxPage };
}

/* ============================================
   8. RENDERING
============================================ */

function renderCategories() {
  const categories = new Set();
  books.forEach((book) => {
    if (book.category) {
      categories.add(book.category.trim());
    }
  });

  categoryRow.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "category-btn" + (currentCategory === "home" ? " active" : "");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
  });
  categoryRow.appendChild(allBtn);

  const bookmarkedBtn = document.createElement("button");
  bookmarkedBtn.className =
    "category-btn" + (currentCategory === "bookmarked" ? " active" : "");
  bookmarkedBtn.innerHTML =
    '<i class="fa-solid fa-bookmark"></i> Bookmarked';
  bookmarkedBtn.addEventListener("click", () => {
    currentCategory = "bookmarked";
    currentPage = 1;
    renderAll();
  });
  categoryRow.appendChild(bookmarkedBtn);

  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((cat) => {
      const btn = document.createElement("button");
      btn.className =
        "category-btn" + (currentCategory === normalize(cat) ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        currentCategory = normalize(cat);
        currentPage = 1;
        renderAll();
      });
      categoryRow.appendChild(btn);
    });
}

function renderBooks() {
  const filtered = getFilteredBooks();
  const { pageItems, total, maxPage } = getPagedBooks(filtered);

  booksContainer.innerHTML = "";

  if (total === 0) {
    booksContainer.innerHTML = "<p>No books found. Try a different search.</p>";
    paginationControls.classList.add("hidden");
    resultsInfo.textContent = "No books found.";
    return;
  }

  if (maxPage > 1) {
    paginationControls.classList.remove("hidden");
  } else {
    paginationControls.classList.add("hidden");
  }

  pageInfo.textContent = `Page ${currentPage} of ${maxPage}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === maxPage;

  pageItems.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";

    const isBookmarked = isBookBookmarked(book);
    const bookmarkIcon = isBookmarked ? "fa-solid" : "fa-regular";

    card.innerHTML = `
      <button class="bookmark-btn" type="button" onclick="toggleBookmark('${book.title.replace(
        /'/g,
        "\\'"
      )}')">
        <i class="${bookmarkIcon} fa-bookmark"></i>
      </button>

      <img src="${book.cover}" alt="Cover of ${book.title}" class="book-cover" />

      <div class="book-info">
        <h3>${book.title}</h3>
        <div class="book-meta">
          ${book.author || "Unknown author"} · ${book.category || "Other"}
        </div>
        <div class="book-description">
          ${book.description || "No description available."}
        </div>
        <div class="book-details">
          ${book.details || ""}
        </div>
        <div class="book-tags">
          ${(book.tags || [])
            .map((tag) => `<span class="book-tag">${tag}</span>`)
            .join("")}
        </div>
        <div class="book-actions">
          <button class="book-read-btn" type="button">
            <i class="fa-solid fa-book-open-reader"></i> Read
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", (event) => {
      if (event.target.closest(".bookmark-btn")) return;
      if (event.target.closest(".book-read-btn")) return;
      openBookModal(book);
    });

    const readBtn = card.querySelector(".book-read-btn");
    readBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openPdf(book.pdfUrl);
    });

    booksContainer.appendChild(card);
  });

  const query = getSearchQuery();
  let base = `${filtered.length} book${filtered.length === 1 ? "" : "s"} found`;

  if (query) base += ` for “${query}”`;

  if (currentCategory === "bookmarked") {
    base += " in your bookmarks";
  } else if (currentCategory !== "home") {
    base += ` in “${currentCategory}”`;
  }

  resultsInfo.textContent = base;
}

function renderCategoryModal() {
  if (!categoryList) return;

  const categories = new Set();
  books.forEach((book) => {
    if (book.category) {
      categories.add(book.category.trim());
    }
  });

  categoryList.innerHTML = "";

  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((cat) => {
      const badge = document.createElement("button");
      badge.className = "category-badge";
      badge.textContent = cat;
      badge.addEventListener("click", () => {
        currentCategory = normalize(cat);
        currentPage = 1;
        closeCategoryModal();
        renderAll();
      });
      categoryList.appendChild(badge);
    });
}

/* ============================================
   9. MODALS & SEARCH OVERLAY
============================================ */

function openBookModal(book) {
  if (!book) return;

  const coverEl = bookModal.querySelector(".modal-cover");
  const titleEl = bookModal.querySelector("h2");
  const metaEl = bookModal.querySelector(".modal-meta");
  const descEl = bookModal.querySelector(".modal-description");
  const detailsEl = bookModal.querySelector(".modal-details");
  const tagsEl = bookModal.querySelector(".modal-tags");

  coverEl.src = book.cover;
  coverEl.alt = `Cover of ${book.title}`;
  titleEl.textContent = book.title;
  metaEl.textContent = `${book.author || "Unknown author"} · ${
    book.category || "Other"
  }`;
  descEl.textContent = book.description || "No description available.";
  detailsEl.textContent = book.details || "";

  tagsEl.innerHTML = "";
  (book.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "modal-tag";
    span.textContent = tag;
    tagsEl.appendChild(span);
  });

  const readBtn = bookModal.querySelector(".modal-read-btn");
  const downloadBtn = bookModal.querySelector(".modal-download-btn");

  readBtn.onclick = () => openPdf(book.pdfUrl);
  downloadBtn.onclick = () => openPdf(book.pdfUrl, true);

  openModal(bookModal);
}

function openModal(modalEl) {
  modalEl.classList.add("open");
  document.body.classList.add("popup-open");
  initHistory();
}

function closeModal(modalEl) {
  modalEl.classList.remove("open");
  document.body.classList.remove("popup-open");
}

function closeBookModal() {
  closeModal(bookModal);
}

function closeCategoryModal() {
  closeModal(categoryModal);
}

function openCategoryModal() {
  categoryModal.classList.add("open");
  document.body.classList.add("popup-open");
  initHistory();
}

function createSearchOverlay() {
  if (searchOverlay) return;

  searchOverlay = document.createElement("div");
  searchOverlay.id = "searchOverlay";
  searchOverlay.innerHTML = `
    <div class="search-overlay-backdrop"></div>
    <div class="search-overlay-panel">
      <div class="search-overlay-row">
        <input id="searchOverlayInput" type="text" placeholder="Search books..." />
        <button id="searchOverlayClose" type="button">
          <i class="fa-solid fa-xmark"></i>
          Close
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(searchOverlay);

  const overlayInput = document.getElementById("searchOverlayInput");
  const overlayClose = document.getElementById("searchOverlayClose");
  const backdrop = searchOverlay.querySelector(".search-overlay-backdrop");

  overlayInput.addEventListener("input", () => {
    searchInput.value = overlayInput.value;
    currentPage = 1;
    renderAll();
  });

  overlayClose.addEventListener("click", () => {
    closeSearchOverlay();
  });

  backdrop.addEventListener("click", () => {
    closeSearchOverlay();
  });
}

function openSearchOverlay() {
  createSearchOverlay();
  searchOverlay.classList.add("open");
  document.body.classList.add("popup-open");
  const overlayInput = document.getElementById("searchOverlayInput");
  overlayInput.value = searchInput.value;
  overlayInput.focus();
  initHistory();
}

function closeSearchOverlay() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove("open");
  document.body.classList.remove("popup-open");
}

/* ============================================
   10. PDF OPEN
============================================ */

function openPdf(url, download = false) {
  if (!url) {
    alert("No PDF URL available for this book.");
    return;
  }
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* ============================================
   11. EVENTS
============================================ */

searchButton.addEventListener("click", () => {
  currentPage = 1;
  renderAll();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    currentPage = 1;
    renderAll();
  }
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  currentPage = 1;
  renderAll();
});

sortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.getAttribute("data-sort");
    if (!sort || sort === currentSort) return;
    currentSort = sort;

    sortButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentPage = 1;
    renderAll();
  });
});

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

/* mobileBottomNav might be null if your HTML doesn’t have it */
if (mobileBottomNav) {
  mobileBottomNav.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-nav]");
    if (!btn) return;

    const nav = btn.getAttribute("data-nav");
    mobileBottomNav
      .querySelectorAll("button[data-nav]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (nav === "home") {
      currentCategory = "home";
      currentPage = 1;
      renderAll();
    } else if (nav === "categories") {
      openCategoryModal();
    } else if (nav === "bookmarks") {
      currentCategory = "bookmarked";
      currentPage = 1;
      renderAll();
    } else if (nav === "search") {
      openSearchOverlay();
    }
  });
}

modalOverlay.addEventListener("click", closeBookModal);
modalClose.addEventListener("click", closeBookModal);

categoryModalOverlay.addEventListener("click", closeCategoryModal);
categoryModalClose.addEventListener("click", closeCategoryModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (searchOverlay && searchOverlay.classList.contains("open")) {
      closeSearchOverlay();
      return;
    }
    if (bookModal.classList.contains("open")) {
      closeBookModal();
      return;
    }
    if (categoryModal.classList.contains("open")) {
      closeCategoryModal();
    }
  }
});

/* ============================================
   12. BACK NAVIGATION
============================================ */

function handleBackNavigation(event) {
  if (searchOverlay && searchOverlay.classList.contains("open")) {
    closeSearchOverlay();
    return;
  }
  if (bookModal.classList.contains("open")) {
    closeBookModal();
    return;
  }
  if (categoryModal.classList.contains("open")) {
    closeCategoryModal();
    return;
  }

  if (currentCategory !== "home") {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
    if (mobileBottomNav) {
      mobileBottomNav
        .querySelectorAll("button[data-nav]")
        .forEach((b) => b.classList.remove("active"));
      const homeBtn = mobileBottomNav.querySelector('button[data-nav="home"]');
      if (homeBtn) homeBtn.classList.add("active");
    }
    return;
  }

  if (!exitConfirmShown) {
    exitConfirmShown = true;
    const confirmExit = confirm("Do you want to leave the library app?");
    if (confirmExit) {
      history.back();
    } else {
      history.pushState({ screen: "home" }, "");
    }
    setTimeout(() => {
      exitConfirmShown = false;
    }, 300);
  }
}

/* ============================================
   13. INIT
============================================ */

function renderAll() {
  renderCategories();
  renderBooks();
  renderCategoryModal();
}

loadBooks();
