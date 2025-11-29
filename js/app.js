/* ============================================
   THEME SYSTEM
   - Uses <html data-theme="light|dark">
   - No white flash thanks to early inline script in <head>
============================================ */

function getCurrentTheme() {
  return (
    document.documentElement.getAttribute("data-theme") ||
    "light"
  );
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);

  // Match background to theme to avoid edge flash
  root.style.backgroundColor =
    theme === "dark" ? "#020617" : "#f9fafb";

  try {
    localStorage.setItem("theme", theme);
  } catch (e) {
    // ignore if storage blocked
  }

  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const icon = btn.querySelector("i");
  if (!icon) return;

  if (theme === "dark") {
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
  } else {
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
  }
}

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  // Initial icon based on already-set theme (from inline script)
  const initialTheme = getCurrentTheme();
  updateThemeIcon(initialTheme);

  btn.addEventListener("click", () => {
    const current = getCurrentTheme();
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // Optional: react to system theme changes if user never set a preference
  try {
    const stored = localStorage.getItem("theme");
    if (!stored && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", (e) => {
        // Only auto-switch if user never explicitly chose
        const storedNow = localStorage.getItem("theme");
        if (!storedNow) {
          applyTheme(e.matches ? "dark" : "light");
        }
      });
    }
  } catch (e) {
    // ignore
  }
}

/* ============================================
   EXISTING APP LOGIC
   - Keep your previous code here (data fetch, search,
     filters, bookmarks, pagination, modals, etc.)
   - Only the theme system above is new/changed.
============================================ */

// Example structure to show where to plug things.
// Replace "// TODO" blocks with your actual existing code.

const SHEET_ID = "YOUR_SHEET_ID_HERE";
const SHEET_TAB = "Sheet1";

const booksContainer = document.getElementById("booksGrid");
const statsEl = document.getElementById("stats");
const sortSelect = document.getElementById("sortSelect");
const categoriesRow = document.getElementById("categoriesRow");
const emptyState = document.getElementById("emptyState");
const resetFiltersButton = document.getElementById("resetFiltersButton");
const prevPageButton = document.getElementById("prevPageButton");
const nextPageButton = document.getElementById("nextPageButton");
const pageInfo = document.getElementById("pageInfo");

const searchInput = document.getElementById("searchInput");
const clearSearchButton = document.getElementById("clearSearchButton");

const advancedSearchButton = document.getElementById("advancedSearchButton");
const searchModal = document.getElementById("searchModal");
const advancedTitleInput = document.getElementById("advancedTitleInput");
const advancedAuthorInput = document.getElementById("advancedAuthorInput");
const advancedTagsInput = document.getElementById("advancedTagsInput");
const advancedClearButton = document.getElementById("advancedClearButton");
const advancedApplyButton = document.getElementById("advancedApplyButton");

const bookModal = document.getElementById("bookModal");
const bookModalCover = document.getElementById("bookModalCover");
const bookModalTitle = document.getElementById("bookModalTitle");
const bookModalAuthor = document.getElementById("bookModalAuthor");
const bookModalCategory = document.getElementById("bookModalCategory");
const bookModalDescription = document.getElementById("bookModalDescription");
const bookModalTags = document.getElementById("bookModalTags");
const bookModalPdfButton = document.getElementById("bookModalPdfButton");
const bookModalBookmarkButton = document.getElementById("bookModalBookmarkButton");

let allBooks = [];
let filteredBooks = [];
let categories = [];
let bookmarks = [];
let currentCategory = "All";
let currentPage = 1;
const PAGE_SIZE = 12;

/* --------- Fetch & Map Data (from Google Sheets) ---------- */

async function fetchBooksFromSheet() {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch sheet");
  }
  const rows = await res.json();
  return rows.map(mapRowToBook);
}

function mapRowToBook(row) {
  return {
    title: (row.Title || "").trim(),
    author: (row.Author || "").trim(),
    category: (row.Category || "Uncategorized").trim(),
    description: (row.Description || "").trim(),
    details: (row.Details || "").trim(),
    tags: (row.Tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    pdfUrl: (row.PDF || row.Pdf || row["PDF URL"] || "").trim(),
    cover: (row.Cover || row.Image || "").trim()
  };
}

/* --------- Local Storage Helpers ---------- */

function loadBookmarks() {
  try {
    const stored = JSON.parse(localStorage.getItem("bookmarks") || "[]");
    if (Array.isArray(stored)) {
      bookmarks = stored;
    }
  } catch (e) {
    bookmarks = [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  } catch (e) {
    // ignore
  }
}

/* --------- Rendering ---------- */

function renderBooks() {
  booksContainer.innerHTML = "";

  const paginated = paginate(filteredBooks, currentPage, PAGE_SIZE);

  if (!paginated.length) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
  }

  paginated.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";

    const isBookmarked = bookmarks.includes(book.title);

    card.innerHTML = `
      <div class="book-cover">
        <img src="${book.cover || "img/placeholder.png"}" alt="${book.title}" />
      </div>
      <h3 class="book-title">${book.title}</h3>
      <p class="book-author">${book.author || "Unknown author"}</p>
      <div class="book-category-label">${book.category}</div>
      <div class="book-tags">
        ${book.tags
          .map((tag) => `<span class="tag-chip">${tag}</span>`)
          .join("")}
      </div>
      <div class="book-links">
        ${
          book.pdfUrl
            ? `<a class="pdf-link" href="${book.pdfUrl}" target="_blank" rel="noopener noreferrer">
                 <i class="fa-solid fa-file-pdf"></i> PDF
               </a>`
            : ""
        }
        <a href="javascript:void(0)" class="details-link">
          <i class="fa-solid fa-circle-info"></i> Details
        </a>
      </div>
      <button class="bookmark-toggle" type="button" aria-label="Bookmark">
        <i class="${isBookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
      </button>
    `;

    // Card click => open details
    card
      .querySelector(".details-link")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        openBookModal(book);
      });

    // Whole card click also opens
    card.addEventListener("click", (e) => {
      if (!e.target.closest(".bookmark-toggle") &&
          !e.target.closest(".details-link") &&
          !e.target.closest(".pdf-link")) {
        openBookModal(book);
      }
    });

    // Bookmark button
    const bmBtn = card.querySelector(".bookmark-toggle");
    bmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(book.title);
      renderBooks();
    });

    booksContainer.appendChild(card);
  });

  renderStats();
  renderPagination();
}

function renderStats() {
  statsEl.textContent = `${filteredBooks.length} book${
    filteredBooks.length === 1 ? "" : "s"
  } found`;
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageButton.disabled = currentPage === 1;
  nextPageButton.disabled = currentPage === totalPages;
}

/* --------- Pagination Helper ---------- */

function paginate(list, page, size) {
  const start = (page - 1) * size;
  return list.slice(start, start + size);
}

/* --------- Filters & Search ---------- */

function applyFilters() {
  const q = (searchInput.value || "").toLowerCase();
  const titleQ = (advancedTitleInput.value || "").toLowerCase();
  const authorQ = (advancedAuthorInput.value || "").toLowerCase();
  const tagsQ = (advancedTagsInput.value || "").toLowerCase();

  filteredBooks = allBooks.filter((b) => {
    // Category filter
    if (currentCategory === "Bookmarks" && !bookmarks.includes(b.title)) {
      return false;
    } else if (
      currentCategory !== "All" &&
      currentCategory !== "Bookmarks" &&
      b.category !== currentCategory
    ) {
      return false;
    }

    const combinedText =
      `${b.title} ${b.author} ${b.category} ${b.tags.join(" ")} ${b.description}`.toLowerCase();

    if (q && !combinedText.includes(q)) return false;
    if (titleQ && !b.title.toLowerCase().includes(titleQ)) return false;
    if (authorQ && !b.author.toLowerCase().includes(authorQ)) return false;
    if (tagsQ && !b.tags.join(" ").toLowerCase().includes(tagsQ)) return false;

    return true;
  });

  sortBooks();
  currentPage = 1;
  renderBooks();
}

function sortBooks() {
  const mode = sortSelect.value;
  const getKey = (b) => {
    if (mode === "title") return b.title.toLowerCase();
    if (mode === "author") return b.author.toLowerCase();
    if (mode === "category") return b.category.toLowerCase();
    return ""; // relevance: keep as filtered order
  };

  if (mode !== "relevance") {
    filteredBooks.sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return 0;
    });
  }
}

/* --------- Categories ---------- */

function buildCategories() {
  const set = new Set(allBooks.map((b) => b.category || "Uncategorized"));
  categories = ["All", "Bookmarks", ...Array.from(set)];
  renderCategories();
}

function renderCategories() {
  categoriesRow.innerHTML = "";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "category-pill";
    if (cat === currentCategory) btn.classList.add("active");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      currentCategory = cat;
      categoriesRow
        .querySelectorAll(".category-pill")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
    });
    categoriesRow.appendChild(btn);
  });
}

/* --------- Bookmarks ---------- */

function toggleBookmark(title) {
  const idx = bookmarks.indexOf(title);
  if (idx === -1) {
    bookmarks.push(title);
  } else {
    bookmarks.splice(idx, 1);
  }
  saveBookmarks();
}

/* --------- Modals ---------- */

function openBookModal(book) {
  bookModalCover.src = book.cover || "img/placeholder.png";
  bookModalTitle.textContent = book.title;
  bookModalAuthor.textContent = book.author || "Unknown author";
  bookModalCategory.textContent = book.category || "Uncategorized";
  bookModalDescription.textContent =
    book.description || book.details || "No description.";
  bookModalTags.innerHTML = book.tags
    .map((t) => `<span class="tag-chip">${t}</span>`)
    .join("");

  if (book.pdfUrl) {
    bookModalPdfButton.href = book.pdfUrl;
    bookModalPdfButton.classList.remove("hidden");
  } else {
    bookModalPdfButton.classList.add("hidden");
  }

  const isBookmarked = bookmarks.includes(book.title);
  const icon = bookModalBookmarkButton.querySelector("i");
  icon.className = `${isBookmarked ? "fa-solid" : "fa-regular"} fa-bookmark`;

  bookModalBookmarkButton.onclick = () => {
    toggleBookmark(book.title);
    const nowBookmarked = bookmarks.includes(book.title);
    icon.className = `${
      nowBookmarked ? "fa-solid" : "fa-regular"
    } fa-bookmark`;
    renderBooks();
  };

  showModal(bookModal);
}

function showModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add("show");
  document.body.classList.add("popup-open");
}

function hideModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("show");
  document.body.classList.remove("popup-open");
}

/* Close buttons & overlays */
document.addEventListener("click", (e) => {
  const closeAttr = e.target.getAttribute("data-close-modal");
  if (closeAttr) {
    const modal = document.getElementById(closeAttr);
    hideModal(modal);
  }

  if (e.target.classList.contains("modal-overlay")) {
    hideModal(e.target.closest(".modal"));
  }
});

/* ESC key closes topmost modal */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    [bookModal, searchModal].forEach((m) => {
      if (m.classList.contains("show")) hideModal(m);
    });
  }
});

/* --------- Search Modal ---------- */

advancedSearchButton.addEventListener("click", () => {
  showModal(searchModal);
});

advancedClearButton.addEventListener("click", () => {
  advancedTitleInput.value = "";
  advancedAuthorInput.value = "";
  advancedTagsInput.value = "";
});

advancedApplyButton.addEventListener("click", () => {
  hideModal(searchModal);
  applyFilters();
});

/* --------- Basic Search ---------- */

searchInput.addEventListener("input", () => {
  applyFilters();
});

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  applyFilters();
});

/* --------- Pagination Buttons ---------- */

prevPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderBooks();
  }
});

nextPageButton.addEventListener("click", () => {
  const totalPages = Math.max(
    1,
    Math.ceil(filteredBooks.length / PAGE_SIZE)
  );
  if (currentPage < totalPages) {
    currentPage++;
    renderBooks();
  }
});

/* --------- Init --------- */

async function init() {
  loadBookmarks();
  initThemeToggle();

  try {
    allBooks = await fetchBooksFromSheet();
    buildCategories();
    filteredBooks = allBooks.slice();
    renderBooks();
  } catch (err) {
    console.error(err);
    booksContainer.innerHTML =
      "<p>Failed to load books. Check your connection and refresh.</p>";
  }
}

document.addEventListener("DOMContentLoaded", init);
