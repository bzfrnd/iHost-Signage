const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const SLIDE_INTERVAL_MS = Number(process.env.SLIDE_INTERVAL_MS || 7000);

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/uploads", express.static(uploadDir, {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  }
}));

app.use("/static", express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store");
  }
}));

function isImageFile(filename) {
  return /\.(jpe?g|png|webp)$/i.test(filename);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[m];
  });
}

function safeFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const name = path.basename(originalName, ext)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";

  return `${Date.now()}-${name}${ext}`;
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    cb(null, safeFilename(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: function (_req, file, cb) {
    if (!isImageFile(file.originalname)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
    }
    cb(null, true);
  }
});

function getImages() {
  return fs.readdirSync(uploadDir)
    .filter(isImageFile)
    .map((filename) => {
      const stat = fs.statSync(path.join(uploadDir, filename));
      return {
        filename,
        url: `/uploads/${encodeURIComponent(filename)}`,
        size: stat.size,
        mtime: stat.mtimeMs
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
}

function requireAdmin(req, res, next) {
  const password = req.query.password || req.body.password || req.headers["x-admin-password"];
  if (password === ADMIN_PASSWORD) {
    return next();
  }

  res.status(401).send(`<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <title>Signage Admin Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/static/admin.css">
</head>
<body>
  <main class="login">
    <h1>Signage Admin</h1>
    <form method="get" action="/admin">
      <label>Jelszó</label>
      <input type="password" name="password" autofocus>
      <button type="submit">Belépés</button>
    </form>
  </main>
</body>
</html>`);
}

app.get("/", (_req, res) => {
  res.redirect("/tv");
});

app.get("/api/images", (_req, res) => {
  res.json({
    intervalMs: SLIDE_INTERVAL_MS,
    images: getImages()
  });
});

app.get("/tv", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "tv.html"));
});

app.get("/admin", requireAdmin, (_req, res) => {
  const images = getImages();

  const items = images.map((img) => `
    <div class="card">
      <img src="${img.url}" alt="">
      <div class="meta">
        <strong>${escapeHtml(img.filename)}</strong>
        <small>${Math.round(img.size / 1024)} KB</small>
      </div>
      <form method="post" action="/delete">
        <input type="hidden" name="password" value="${escapeHtml(ADMIN_PASSWORD)}">
        <input type="hidden" name="filename" value="${escapeHtml(img.filename)}">
        <button class="danger" type="submit">Törlés</button>
      </form>
    </div>
  `).join("");

  res.send(`<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <title>Signage Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/static/admin.css">
</head>
<body>
  <main class="wrap">
    <header>
      <h1>Signage Admin</h1>
      <a href="/tv" target="_blank">TV nézet</a>
    </header>

    <section class="panel">
      <h2>Kép feltöltése</h2>
      <form method="post" action="/upload" enctype="multipart/form-data">
        <input type="hidden" name="password" value="${escapeHtml(ADMIN_PASSWORD)}">
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
        <button type="submit">Feltöltés</button>
      </form>
      <p class="hint">Támogatott: JPG, PNG, WEBP. Max 25 MB.</p>
    </section>

    <section class="grid">
      ${items || '<p class="empty">Még nincs feltöltött kép.</p>'}
    </section>
  </main>
</body>
</html>`);
});

app.post("/upload", upload.single("image"), (req, res) => {
  const password = req.query.password || req.body.password;

  if (password !== ADMIN_PASSWORD) {
    return res.redirect("/admin");
  }

  res.redirect(`/admin?password=${encodeURIComponent(ADMIN_PASSWORD)}`);
});

app.post("/delete", requireAdmin, (req, res) => {
  const filename = path.basename(req.body.filename || "");
  if (filename && isImageFile(filename)) {
    const filePath = path.join(uploadDir, filename);
    if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  res.redirect(`/admin?password=${encodeURIComponent(ADMIN_PASSWORD)}`);
});

app.use((err, _req, res, _next) => {
  res.status(400).send(`Hiba: ${err.message}`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`iHost Signage running on port ${PORT}`);
});
