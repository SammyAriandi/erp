# ERP Monorepo

ERP (Enterprise Resource Planning) berbasis web dengan arsitektur **monorepo**, dirancang untuk fleksibel digunakan pada berbagai jenis perusahaan (manufaktur, distribusi, jasa, dll).

Project ini dikembangkan dengan pendekatan **modular**, sehingga setiap bagian (API, Web, shared packages) dapat dikembangkan dan diskalakan secara independen.

---

## 📦 Struktur Project

erp/
├─ apps/
│ ├─ api/ # Backend API (auth, database, business logic)
│ └─ web/ # Frontend Web (dashboard, UI, client)
│
├─ packages/ # Shared packages (utils, types, config, dll)
│
├─ infra/ # Infrastructure / deployment (opsional)
│
├─ .env.example # Contoh environment variable
├─ .gitignore
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
└─ README.md

---

## 🧰 Tech Stack (Awal)
- **Node.js**
- **pnpm** (workspace / monorepo)
- Backend: (akan ditentukan / dikembangkan)
- Frontend: (akan ditentukan / dikembangkan)

> Detail stack akan diperbarui seiring perkembangan project.

---

## ⚙️ Prasyarat
Pastikan tools berikut sudah terinstall:
- Node.js (disarankan versi LTS)
- pnpm

Cek:
```bash
node -v
pnpm -v

🚀 Setup Local Development
1️⃣ Install dependency
pnpm install

2️⃣ Setup environment variable
cp .env.example .env


Isi nilai .env sesuai kebutuhan local kamu.
File .env tidak di-commit ke repository.

▶️ Menjalankan Project (contoh awal)

Script akan berkembang sesuai kebutuhan.

pnpm dev


Atau per aplikasi:

pnpm --filter api dev
pnpm --filter web dev

🌱 Konvensi Git
Branch

main → branch utama (stable)

feature/* → pengembangan fitur

fix/* → perbaikan bug

Commit Message

Gunakan format:

feat: fitur baru

fix: bug fix

chore: config / tooling

docs: dokumentasi

refactor: refactor code

Contoh:

feat: add authentication module
docs: update README

🔐 Keamanan

.env dan file sensitif di-ignore

Jangan commit credential, token, atau secret ke repository

📌 Catatan

Project ini masih dalam tahap awal pengembangan.
Dokumentasi, struktur, dan workflow akan terus disempurnakan.

📄 License

Private / Internal Project


---

## Langkah berikutnya (disarankan)
Setelah README ini:
```bash
git add README.md
git commit -m "docs: add initial README"
git push