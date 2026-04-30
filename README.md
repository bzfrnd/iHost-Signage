# iHost Signage

Mini local signage server for Sonoff iHost / Docker.

## Funkciók

- `/admin` — képek feltöltése és törlése böngészőből
- `/tv` — teljes képernyős slideshow LG webOS böngészőhöz
- helyi JPG / PNG / WEBP tárolás
- nincs külső cloud

## Telepítés repositoryból

```bash
git clone https://github.com/FELHASZNALO/ihost-signage.git
cd ihost-signage
docker compose up -d --build
```

## Elérés

Admin:

```text
http://IHOST-IP:8080/admin?password=changeme
```

TV nézet:

```text
http://IHOST-IP:8080/tv
```

## Beállítások

A `docker-compose.yml` fájlban:

```yaml
environment:
  - ADMIN_PASSWORD=changeme
  - SLIDE_INTERVAL_MS=7000
```

Állítsd át az `ADMIN_PASSWORD` értékét.

## Képek

A feltöltött képek itt maradnak meg:

```text
./uploads
```

## LG webOS TV

A TV böngészőjében nyisd meg:

```text
http://IHOST-IP:8080/tv
```

Érdemes a TV-nek és az iHostnak fix IP-t adni a routerben.
