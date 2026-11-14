# ==========================================
# Etap 1: Budowanie aplikacji (Vite + React)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Kopiowanie plików definicji pakietów
COPY package.json package-lock.json ./

# Instalacja zależności
RUN npm ci

# Kopiowanie pozostałych plików źródłowych
COPY . .

# Kompilacja TypeScript oraz produkcyjny build Vite
RUN npm run build

# ==========================================
# Etap 2: Serwowanie przez lekki Nginx
# ==========================================
FROM nginx:alpine

# Kopiowanie konfiguracji Nginx z obsługą SPA i gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Kopiowanie skompilowanej aplikacji z etapu budowania
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
