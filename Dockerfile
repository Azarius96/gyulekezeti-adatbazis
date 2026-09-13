# Egyetlen image, ami mindent tartalmaz: a Fastify API-szervert és a lebuildelt React
# frontendet is - a szerver saját magát szolgálja ki ugyanarról az originről (ld. app.ts
# WEB_DIST_PATH ága), így nincs szükség külön frontend-szolgáltatásra vagy CORS-ra.
FROM node:22-bookworm-slim

# postgresql-client: a biztonsági mentés/visszaállítás (BACKUP_STRATEGY=direct) ezzel éri el
# közvetlenül, hálózaton keresztül a Postgres-t - nincs szükség docker.sock hozzáférésre.
# FONTOS: a pg_dump-nak legalább akkora verziójúnak kell lennie, mint maga a Postgres szerver
# (különben "server version mismatch" hibával leáll) - a Debian alap csomagtára csak egy régebbi
# kliens-verziót ad, ezért a hivatalos PostgreSQL (PGDG) tárolóból a legfrissebb (18-as) klienst
# telepítjük, ami minden jelenlegi Postgres szerverrel kompatibilis.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Csomag-manifestek külön másolva a jobb Docker-réteg gyorsítótárazásért. NODE_ENV=production
# csak a build UTÁN kerül beállításra - a buildhez (tsc, vite) kellenek a devDependencies is,
# amiket az `npm ci` NODE_ENV=production mellett szó nélkül kihagyna.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY server server
COPY web web

RUN npm run --workspace=server prisma:generate
RUN npm run --workspace=server build
RUN npm run --workspace=web build

ENV NODE_ENV=production
ENV WEB_DIST_PATH=/app/web/dist
ENV BACKUP_STRATEGY=direct
ENV PORT=4000
EXPOSE 4000

WORKDIR /app/server
# Induláskor mindig lefuttatjuk a függőben lévő adatbázis-migrációkat (ez biztonságosan
# no-op, ha már minden alkalmazva van), utána indul csak a szerver.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
