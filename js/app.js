/* ============================================================
   OPEN SHEET CONFIG
============================================================ */
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

/* ============================================================
   STATE MANAGEMENT
============================================================ */
let books = [];
let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

let currentSearch = "";
let globalSort = "relevance";
let globalView = "grid";
let showOnlyBookmarks = false;

/* ============================================================
   DOM ELEMENTS
============================================================ */
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const resultsInfo = document.getElementById("resultsInfo");
const mainContentArea = document.getElementById("mainContentArea");
const headerBookmarkBtn = document.getElementById("headerBookmarkBtn");
const categoryNav = document.getElementById("categoryNav");
const bookModal = document.getElementById("bookModal");
const bookModalBody = bookModal.querySelector(".modal-body");
const bookModalClose = bookModal.querySelector(".modal-close");
const bookModalOverlay = bookModal.querySelector(".modal-overlay");
const mobileBottomNav = document.getElementById("mobileBottomNav");
const themeToggle = document.getElementById("themeToggle");


/* ============================================================
   INIT & THEME
============================================================ */
function applyTheme(mode) {
  document.body.classList.remove("dark", "light");
  document.body.classList.add(mode);
  themeToggle.innerHTML = mode === "dark" 
    ? '<i class="fa-regular fa-sun"></i>' 
    : '<i class="fa-regular fa-moon"></i>';
}
let savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  savedTheme = savedTheme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", savedTheme);
  applyTheme(savedTheme);
});

/* ============================================================
   KEYBOARD SHORTCUTS
============================================================ */
document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === "Escape") {
        if (!bookModal.classList.contains("hidden")) {
            closeBookPopup();
        } else if (document.activeElement === searchInput) {
            searchInput.blur();
        }
    }
});

/* ============================================================
   HELPERS & FUZZY SEARCH
============================================================ */
function norm(x) { return (x || "").toString().trim().toLowerCase(); }
function getCover(x) { return x ? x : "img/book.jpg"; }

// Levenshtein Distance for Fuzzy Search
function getEditDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(text, query) {
  const nText = norm(text);
  const nQuery = norm(query);
  if (nText.includes(nQuery)) return true; 
  const allowedErrors = Math.floor(nQuery.length / 4) + 1; 
  const words = nText.split(/\s+/);
  for (let w of words) {
    if (Math.abs(w.length - nQuery.length) > 2) continue; 
    if (getEditDistance(w, nQuery) <= allowedErrors) return true;
  }
  return false;
}

function formatCategoryName(str) {
  if (!str) return "Other";
  return str.toString().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function setHash(hash) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/* ============================================================
   DATA LOADING & SKELETON
============================================================ */
function showSkeleton() {
    let html = `<div class="page-section skeleton-grid">`;
    for(let i=0; i<12; i++) {
        html += `<div class="skeleton-card"></div>`;
    }
    html += `</div>`;
    mainContentArea.innerHTML = html;
}

function mapBook(row) {
  const b = {};
  b.title = row.title?.trim() || "";
  b.author = row.author?.trim() || "";
  b.category = formatCategoryName(row.category?.trim() || "Other");
  b.description = row.description?.trim() || "";
  b.cover = getCover(row.cover);
  b.pdfUrl = row.pdfurl?.trim() || row.pdf?.trim() || "";
  
  const rawTags = row.tags?.trim() || "";
  b.tags = rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  return b;
}

function loadBooks() {
  showSkeleton(); 
  
  fetch(SHEET_URL)
    .then((r) => r.json())
    .then((rows) => {
      books = rows.map(mapBook);
      renderCategoryNav(); 
      applyHashFromLocation();
    })
    .catch(() => {
      mainContentArea.innerHTML = "<p style='text-align:center;'>Error loading data</p>";
    });
}

function sortBooks(arr) {
  switch (globalSort) {
    case "title": return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "author": return arr.sort((a, b) => a.author.localeCompare(b.author));
    case "sizeDesc": return arr.sort((a, b) => (b.sizeMB || 0) - (a.sizeMB || 0));
    default: return arr;
  }
}

function getUniqueCategories(filteredBooks) {
    const s = new Set();
    filteredBooks.forEach(b => s.add(b.category));
    return Array.from(s).sort();
}

/* ============================================================
   STICKY CATEGORY NAV & SCROLL SPY
============================================================ */
function renderCategoryNav() {
    const cats = getUniqueCategories(books);
    if(cats.length < 2) { 
        categoryNav.classList.add("hidden"); 
        return; 
    }
    
    categoryNav.classList.remove("hidden");
    categoryNav.innerHTML = cats.map(c => 
        `<button class="cat-nav-chip" data-cat="${c}" onclick="scrollToCategory('${c}')">${c}</button>`
    ).join("");
}

window.scrollToCategory = (catName) => {
    const id = `cat-block-${catName.replace(/\s+/g, '-')}`;
    const el = document.getElementById(id);
    if(el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({top: y, behavior: 'smooth'});
    }
};

// SCROLL SPY
function initScrollSpy() {
    const sections = document.querySelectorAll('.category-block');
    const navLinks = document.querySelectorAll('.cat-nav-chip');

    if (sections.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active from all
                navLinks.forEach(link => link.classList.remove('active'));
                
                // Add active to current
                const catName = entry.target.dataset.cat;
                const activeBtn = Array.from(navLinks).find(btn => btn.dataset.cat === catName);
                if (activeBtn) {
                    activeBtn.classList.add('active');
                    // Keep active button in view
                    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
        });
    }, {
        rootMargin: '-20% 0px -60% 0px' 
    });

    sections.forEach(section => observer.observe(section));
}

/* ============================================================
   RENDER LOGIC
============================================================ */
function renderBooks() {
  mainContentArea.innerHTML = "";
  
  let filtered = books.filter((b) => {
    if (showOnlyBookmarks && !bookmarks.includes(b.title)) return false;
    if (currentSearch) {
      const text = b.title + " " + b.author + " " + b.category + " " + b.tags.join(" ");
      if (!fuzzyMatch(text, currentSearch)) return false;
    }
    return true;
  });

  resultsInfo.textContent = filtered.length ? `${filtered.length} Results` : "No results";
  
  const cats = getUniqueCategories(filtered);

  if (cats.length === 0) {
      mainContentArea.innerHTML = `<div class="page-section" style="text-align:center;color:#888;">No books found.</div>`;
      return;
  }

  cats.forEach(catName => {
      let catBooksAll = filtered.filter(b => b.category === catName);
      catBooksAll = sortBooks(catBooksAll);

      const section = document.createElement("section");
      section.className = "category-block page-section";
      section.id = `cat-block-${catName.replace(/\s+/g, '-')}`;
      section.dataset.cat = catName; // For ScrollSpy

      // Header
      const headerDiv = document.createElement("div");
      headerDiv.className = "category-header";
      headerDiv.innerHTML = `
        <h2 class="cat-title">${catName}</h2>
            <div class="cat-controls">
            <button class="ctrl-btn view-toggle ${globalView === 'list' ? 'active' : ''}">
                <i class="fa-solid ${globalView === 'list' ? 'fa-border-all' : 'fa-list'}"></i>
            </button>
            <button class="ctrl-btn sort-toggle">
               <i class="fa-solid fa-arrow-down-wide-short"></i>
            </button>
        </div>
      `;

      headerDiv.querySelector(".view-toggle").addEventListener("click", () => {
          globalView = globalView === "grid" ? "list" : "grid";
          renderBooks(); 
      });
      headerDiv.querySelector(".sort-toggle").addEventListener("click", () => {
          if (globalSort === "relevance") globalSort = "title";
          else if (globalSort === "title") globalSort = "sizeDesc";
          else globalSort = "relevance";
          renderBooks();
      });
      section.appendChild(headerDiv);

      // Grid
      const grid = document.createElement("div");
      grid.className = `books-container ${globalView === "list" ? "list-view" : ""}`;
      
      catBooksAll.forEach(b => {
          grid.appendChild(createBookCard(b));
      });
      
      section.appendChild(grid);
      mainContentArea.appendChild(section);
  });

  initScrollSpy();
}

function createBookCard(b) {
    const starred = bookmarks.includes(b.title);
    const card = document.createElement("div");
    card.className = "book-card";
    
    card.innerHTML = `
      <button class="bookmark-btn">
        ${starred ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>'}
      </button>
      <img class="book-cover" loading="lazy" src="${b.cover}" onerror="this.src='img/book.jpg'">
      <div class="book-info">
        <div class="book-title">${b.title}</div>
        <div class="book-author">by ${b.author}</div>
        <div class="book-links">
          <a href="${b.pdfUrl}" target="_blank"><i class="fa-solid fa-file-pdf"></i> Get PDF</a>
        </div>
      </div>
    `;
    card.querySelector(".bookmark-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(b.title);
    });
    card.addEventListener("click", () => openBookPopup(b));
    return card;
}

/* ============================================================
   BOOKMARKS & POPUP
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

headerBookmarkBtn.addEventListener("click", () => {
    showOnlyBookmarks = !showOnlyBookmarks;
    headerBookmarkBtn.classList.toggle("active", showOnlyBookmarks);
    if(showOnlyBookmarks) setHash("#bookmarks");
    else setHash("#all");
    renderBooks();
});

function openBookPopup(b) {
  const related = books
    .filter(x => x.category === b.category && x.title !== b.title)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);
    
  let relatedHTML = "";
  if(related.length > 0) {
      const cards = related.map(r => `
        <div class="related-card" onclick='openRelatedTitle("${r.title.replace(/'/g, "\\'")}")'>
            <img class="related-cover" src="${r.cover}">
            <div class="related-name">${r.title}</div>
        </div>
      `).join("");
      relatedHTML = `<div class="related-section"><div class="related-title">Related Books</div><div class="related-grid">${cards}</div></div>`;
  }

  const chipHTML = b.tags.map((t) => `<span class="tag-chip">${t}</span>`).join("");

  bookModalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${b.cover}" onerror="this.src='img/book.jpg'">
      <div class="modal-book-main">
        <h3>${b.title}</h3>
        <p class="modal-author-category">${b.author} • ${b.category} ${chipHTML}</p>
      </div>
    </div>
    ${b.description ? `<div class="modal-section"><p>${b.description}</p></div>` : ""}
    
    <div class="modal-actions">
      <a href="${b.pdfUrl}" target="_blank" class="modal-btn">
        <i class="fa-solid fa-file-pdf"></i> Get PDF
      </a>
      <button id="popupBookmark" class="modal-btn">
        ${bookmarks.includes(b.title) ? '<i class="fa-solid fa-star"></i> Remove' : '<i class="fa-regular fa-star"></i> Save'}
      </button>
      
    </div>
    
    ${relatedHTML}
  `;

  bookModal.classList.remove("hidden");
  if (b.pdfUrl) {
    const fileName = b.pdfUrl.split("/").pop();
    setHash("#book=" + encodeURIComponent(fileName));
  }

  document.getElementById("popupBookmark").addEventListener("click", () => {
      toggleBookmark(b.title);
      openBookPopup(b);
  });
  
}


window.openRelatedTitle = (title) => {
    const book = books.find(b => b.title === title);
    if(book) openBookPopup(book);
};

function closeBookPopup() {
  bookModal.classList.add("hidden");
}
bookModalClose.addEventListener("click", closeBookPopup);
bookModalOverlay.addEventListener("click", closeBookPopup);

/* ============================================================
   SEARCH & INIT
============================================================ */
function performSearch() {
    currentSearch = searchInput.value.trim();
    renderBooks();
}
searchButton.addEventListener("click", performSearch);
clearSearchButton.addEventListener("click", () => {
  currentSearch = "";
  searchInput.value = "";
  renderBooks();
});
searchInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") performSearch();
});

mobileBottomNav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;
  const nav = btn.dataset.nav;
  if (nav === "home") { showOnlyBookmarks = false; headerBookmarkBtn.classList.remove("active"); currentSearch=""; searchInput.value=""; setHash("#all"); }
  if (nav === "bookmarks") { showOnlyBookmarks = true; headerBookmarkBtn.classList.add("active"); setHash("#bookmarks"); }
  renderBooks();
});

function applyHashFromLocation() {
  const hashRaw = window.location.hash || "";
  if (!hashRaw.startsWith("#book=")) closeBookPopup();
  let hash = hashRaw.replace(/^#/, "");

  if (hash === "bookmarks") { showOnlyBookmarks = true; headerBookmarkBtn.classList.add("active"); }
  else { showOnlyBookmarks = false; headerBookmarkBtn.classList.remove("active"); }

  if (hash.startsWith("book=")) {
      const fileName = decodeURIComponent(hash.slice("book=".length));
      const book = books.find((b) => b.pdfUrl.split("/").pop() === fileName);
      if (book) openBookPopup(book);
  }
  renderBooks();
}
window.addEventListener("hashchange", applyHashFromLocation);
loadBooks();
