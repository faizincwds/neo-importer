# Neo Feeder Importer System

A modern, responsive web application for importing data into Neo Feeder system. Built with vanilla JavaScript ES6+, TailwindCSS v4, and SheetJS.

## 📋 Fitur Utama

- 🔐 **Authentication** - Login dengan token Neo Feeder
- 📊 **Dashboard** - Monitoring status API, statistik data
- 📥 **Import Data** - Upload Excel/CSV dengan auto-mapping
- 🔍 **Referensi Data** - Load data dari berbagai endpoint Neo Feeder
- 📝 **Activity Logging** - Log semua aktivitas import dan API
- 🌓 **Dark/Light Mode** - Tema yang dapat disesuaikan
- 📱 **Responsive** - Mendukung desktop dan mobile
- 💾 **LocalStorage** - Menyimpan data sementara di browser

## 🚀 Cara Menjalankan

### Prerequisites

- Web browser modern (Chrome, Firefox, Safari, Edge)
- Neo Feeder API server running on `http://localhost:3003`

### Instalasi

1. Clone atau download project ini
2. Buka folder `neo-importer`
3. Jalankan dengan web server lokal:

```bash
# Menggunakan Python 3
python -m http.server 8000

# Menggunakan Node.js (npx)
npx serve .

# Menggunakan PHP
php -S localhost:8000
```

### Struktur Folder
```bash
neo-importer
 ┣ css
 ┃ ┗ style.css
 ┣ dist
 ┃ ┗ xlsx.full.min.js
 ┣ js
 ┃ ┣ api.js
 ┃ ┣ app.js
 ┃ ┣ auth.js
 ┃ ┣ config.js
 ┃ ┣ dashboard.js
 ┃ ┣ gridEditor.js
 ┃ ┣ importProcess.js
 ┃ ┣ insertWizard.js
 ┃ ┣ logger.js
 ┃ ┣ lookupEngine.js
 ┃ ┣ mappingEngine.js
 ┃ ┣ note.text
 ┃ ┣ referensi.js
 ┃ ┣ utils.js
 ┃ ┣ validator.js
 ┃ ┗ viewManager.js
 ┣ index.html
 ┣ README.md
```