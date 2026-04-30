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

app.use("/uploads", express.static(uploadDir));
app.use("/static", express.static(path.join(__dirname, "public")));

function isImageFile(filename) {
  return /\.(jpe?g|png|webp)$/i.test(filename);
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
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, safeFilename(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
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
  const password = req.query.password || req.body.password;

  if (password === ADMIN_PASSWORD) return next();

  res.status(401).send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signage Admin</title>
  <style>
    body{font-family:Arial;background:#111;color:#fff;padding:40px}
    input,button{padding:12px;font-size:16px}
  </style>
</head>
<body>
  <h1>Signage Admin</h1>
  <form method="get" action="/admin">
    <input type="password" name="password" placeholder="Jelszó">
    <button type="submit">Belépés</button>
  </form>
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

app.get("/tv", (req, res) => {
  const images = getImages();

  const imageList = JSON.stringify(
    images.map(img => "http://" + req.headers.host + img.url + "?v=" + Math.round(img.mtime))
  );

  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>TV Signage</title>
  <style>
    html,body{
      margin:0;
      width:100%;
      height:100%;
      background:#000;
      overflow:hidden;
      cursor:none;
    }
    #photo{
      width:100vw;
      height:100vh;
      object-fit:contain;
      background:#000;
      display:none;
    }
    #empty{
      color:white;
      font-family:Arial,sans-serif;
      font-size:32px;
      position:fixed;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
    }
  </style>
</head>
<body>
  <img id="photo">
  <div id="empty">Nincs feltöltött kép</div>

  <script>
    var images = ${imageList};
    var index = 0;
    var intervalMs = ${SLIDE_INTERVAL_MS};

    var img = document.getElementById("photo");
    var empty = document.getElementById("empty");

    function showNext(){
      if(!images.length){
        img.style.display = "none";
        empty.style.display = "flex";
        return;
      }

      empty.style.display = "none";
      img.style.display = "block";
      img.src = images[index % images.length];
      index++;
    }

    showNext();
    setInterval(showNext, intervalMs);
  </script>
</body>
</html>`);
});

app.get("/admin", requireAdmin, (_req, res) => {
  const images = getImages();

  const items = images.map(img => `
    <div style="background:#222;padding:12px;border-radius:10px;margin-bottom:12px">
      <img src="${img.url}" style="max-width:220px;display:block;margin-bottom:8px">
      <strong>${img.filename}</strong><br>
      <small>${Math.round(img.size / 1024)} KB</small>
      <form method="post" action="/delete" style="margin-top:8px">
        <input type="hidden" name="password" value="${ADMIN_PASSWORD}">
        <input type="hidden" name="filename" value="${img.filename}">
        <button type="submit">Törlés</button>
      </form>
    </div>
  `).join("");

  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signage Admin</title>
  <style>
    body{font-family:Arial;background:#111;color:#fff;padding:30px}
    input,button{padding:10px;font-size:16px}
    a{color:#fff}
  </style>
</head>
<body>
  <h1>Signage Admin</h1>

  <p><a href="/tv" target="_blank">TV nézet</a></p>

  <form method="post" action="/upload?password=${encodeURIComponent(ADMIN_PASSWORD)}" enctype="multipart/form-data">
    <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
    <button type="submit">Feltöltés</button>
  </form>

  <hr>

  ${items || "<p>Még nincs feltöltött kép.</p>"}
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
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  res.redirect(`/admin?password=${encodeURIComponent(ADMIN_PASSWORD)}`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`iHost Signage running on port ${PORT}`);
});
