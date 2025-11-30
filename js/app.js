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

let searchOverlay = null;

/* ============================================
   3. STATE
============================================ */

let currentCategory = "home";
let currentSort = "relevance";
let currentPage = 1;
const PAGE_SIZE = 12;

let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");
let historyInitialized = false;
let exitConfirmShown = false;
let currentSearch = "";
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
   5. THEME (DARK ONLY)
============================================ */

// Force dark mode; ignore any previous saved theme or toggle
document.body.classList.add("dark");

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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text) {
  if (!currentSearch) return text;
  const q = currentSearch.trim();
  if (!q) return text;
  try {
    return text.replace(
      new RegExp(escapeRegExp(q), "ig"),
      m => `<mark>${m}</mark>`
    );
  } catch {
    return text;
  }
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

function getSearchQuery() {
  return (searchInput.value || "").trim();
}

function isBookBookmarked(book) {
  return bookmarks.includes(book.title);
}

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

/* LOWERCASE column names: title, author, category, cover, tags, description, details, pdfurl */
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

  const pdfUrl = (row.pdfurl || row.pdf || row.url || "").trim();
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
   8. FILTER + SORT + PAGINATION
============================================ */

function getFilteredBooks() {
  const query = getSearchQuery();
  currentSearch = query;
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const items = allBooks
    .slice(start, end)
    .map(book => ({ book }));

  return { items, total, totalPages };
}

/* ============================================
   9. RENDERING
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
  bookmarkedBtn.textContent = "Bookmarked";
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
  const allItems = getFilteredBooks();
  const total = allItems.length;

  if (!currentSearch) {
    resultsInfo.textContent = `${total} book${total === 1 ? "" : "s"} available`;
  } else {
    resultsInfo.textContent = `${total} book${total === 1 ? "" : "s"} found for “${currentSearch}”`;
  }

  if (!total) {
    booksContainer.innerHTML = "<p>No books found. Try a different search.</p>";
    paginationControls.classList.add("hidden");
    return;
  }

  const { items, totalPages } = getPagedBooks(allItems);

  if (totalPages > 1) {
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
        <a href="${book.pdfUrl || "#"}"
           target="_blank"
           rel="noopener noreferrer">
           <i class="fa-solid fa-file-pdf"></i>
           <span>Get PDF</span>
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

/* Render category modal list */
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
   10. MODALS & SEARCH OVERLAY
============================================ */

function updatePopupOpenClass() {
  const anyOpen =
    !bookModal.classList.contains("hidden") ||
    !categoryModal.classList.contains("hidden") ||
    (searchOverlay && searchOverlay.classList.contains("open"));

  if (anyOpen) {
    document.body.classList.add("popup-open");
  } else {
    document.body.classList.remove("popup-open");
  }
}

function openBookModal(book) {
  if (!book) return;

  const dialogHtml = `
    <div class="modal-body">
      <img src="${book.cover || "img/book.jpg"}"
           alt=""
           class="modal-cover"
           onerror="this.src='img/book.jpg';" />

      <div class="modal-info">
        <h2>${book.title}</h2>
        <div class="modal-meta">
          ${book.author || "Unknown author"} · ${book.category || "Other"}
        </div>

        <h3>Summary</h3>
        <div class="modal-description">
          ${book.description || "No description available."}
        </div>

        ${
          book.details
            ? `<h3>Details</h3><div class="modal-details">${book.details}</div>`
            : ""
        }

        ${
          (book.tags || []).length
            ? `<h3>Tags</h3>
               <div class="modal-tags">
                 ${book.tags.map(tag => `<span class="modal-tag">${tag}</span>`).join("")}
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
        </div>
      </div>
    </div>
  `;

  modalBody.innerHTML = dialogHtml;

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
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    closeBookModal();
  }
});

function openCategoryModal() {
  categoryModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setActiveNav("categories");
  updatePopupOpenClass();
}

function closeCategoryModal() {
  categoryModal.classList.add("hidden");
  document.body.style.overflow = "";
  setActiveNav("home");
  updatePopupOpenClass();
}

categoryModalClose.addEventListener("click", closeCategoryModal);
categoryModalOverlay.addEventListener("click", (e) => {
  if (e.target === categoryModalOverlay) {
    closeCategoryModal();
  }
});

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
   11. PDF OPEN
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
   12. EVENTS
============================================ */

searchButton.addEventListener("click", () => {
  currentSearch = searchInput.value.trim();
  currentPage = 1;
  sortControls.classList.toggle("hidden", !currentSearch);
  renderBooks();
});

searchInput.addEventListener("keyup", e => {
  if (e.key === "Enter") {
    currentSearch = searchInput.value.trim();
    currentPage = 1;
    sortControls.classList.toggle("hidden", !currentSearch);
    renderBooks();
  }
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  currentSearch = "";
  currentPage = 1;
  sortControls.classList.add("hidden");
  renderBooks();
});

sortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.getAttribute("data-sort");
    if (!sort || sort === currentSort) return;
    currentSort = sort;

    sortButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentPage = 1;
    renderBooks();
  });
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderBooks();
  }
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderBooks();
});

function setActiveNav(target) {
  const buttons = mobileBottomNav.querySelectorAll("button[data-nav]");
  buttons.forEach((btn) => {
    const nav = btn.getAttribute("data-nav");
    btn.classList.toggle("active", nav === target);
  });
}

mobileBottomNav.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-nav]");
  if (!btn) return;

  const nav = btn.getAttribute("data-nav");
  const buttons = mobileBottomNav.querySelectorAll("button[data-nav]");
  buttons.forEach((b) => b.classList.remove("active"));
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (searchOverlay && searchOverlay.classList.contains("open")) {
      closeSearchOverlay();
      return;
    }
    if (!bookModal.classList.contains("hidden")) {
      closeBookModal();
      return;
    }
    if (!categoryModal.classList.contains("hidden")) {
      closeCategoryModal();
    }
  }
});

/* ============================================
   13. BACK NAVIGATION
============================================ */

function handleBackNavigation(event) {
  if (searchOverlay && searchOverlay.classList.contains("open")) {
    closeSearchOverlay();
    return;
  }
  if (!bookModal.classList.contains("hidden")) {
    closeBookModal();
    return;
  }
  if (!categoryModal.classList.contains("hidden")) {
    closeCategoryModal();
    return;
  }

  if (currentCategory !== "home") {
    currentCategory = "home";
    currentPage = 1;
    renderAll();
    setActiveNav("home");
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
   14. INIT
============================================ */

function renderAll() {
  renderCategories();
  renderBooks();
  renderCategoryModal();
}

loadBooks();
