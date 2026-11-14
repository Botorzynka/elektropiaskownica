# ⚡ ElektroPiaskownica – Laboratorium Elektrotechniki i Elektroniki

Interaktywna platforma edukacyjna (EdTech) do nauki i rozwiązywania zadań z elektrotechniki, elektroniki analogowej oraz techniki cyfrowej dla studentów.

---

## 🐳 Uruchomienie przez Docker

Upewnij się, że masz uruchomioną aplikację **Docker Desktop**.

### 1. Szybki start za pomocą Docker Compose (Zalecane)

W katalogu projektu uruchom:

```bash
docker compose up --build -d
```

Aplikacja będzie natychmiast dostępna w przeglądarce pod adresem:
👉 **[http://localhost:5173](http://localhost:5173)**

Zatrzymanie kontenera:
```bash
docker compose down
```

---

### 2. Uruchomienie za pomocą czystego polecenia Docker

Możesz też zbudować i odpalić obraz ręcznie:

```bash
# 1. Zbudowanie obrazu
docker build -t elektropiaskownica .

# 2. Uruchomienie kontenera
docker run -d -p 5173:80 --name elektropiaskownica elektropiaskownica
```

Zatrzymanie i usunięcie:
```bash
docker stop elektropiaskownica && docker rm elektropiaskownica
```

---

### 3. Tryb deweloperski w Dockerze (Hot-Reload)

Jeśli chcesz rozwijać kod wewnątrz kontenera z automatycznym odświeżaniem zmian:

```bash
docker compose --profile dev up --build elektropiaskownica-dev
```
Aplikacja deweloperska będzie dostępna pod adresem:
👉 **[http://localhost:5174](http://localhost:5174)**

---

## 💻 Uruchomienie lokalne (bez Dockera)

Wymagany **Node.js** (v18+):

```bash
npm install
npm run dev
```
Domyślny adres: **[http://localhost:5173](http://localhost:5173)**
