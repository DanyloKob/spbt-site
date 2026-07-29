# spbt-site

Сайт **SPBT — Small Projects by Taiyo**, `https://spbt.pp.ua`.

Статика без збірки: HTML + CSS + один ES-модуль. Ніяких залежностей,
ніякого `npm install`. Хоститься на GitHub Pages.

## Структура

```
index.html          одна сторінка: hero, послуги, проєкти, контакти
404.html            сторінка помилки (noindex)
CNAME               spbt.pp.ua
.nojekyll           Pages не проганяє файли через Jekyll
robots.txt
sitemap.xml
assets/
  css/site.css      токени, компоненти — все в одному файлі
  js/site.js        поява блоків при скролі + тінь навбара
  img/favicon.svg
  fonts/*.woff2     Unbounded, Manrope, JetBrains Mono (самохост)
```

## Локальний перегляд

Будь-який статичний сервер із кореня репозиторію:

```bash
npx serve .
# або
python -m http.server 8000
```

Саме через сервер, а не `file://`: браузери блокують ES-модулі з `file://`
(CORS), тому `site.js` не завантажиться і блоки з'являться лише через
2.5 с, коли спрацює failsafe. Верстка та шрифти при цьому цілі.

## Домен

`CNAME` тримає `spbt.pp.ua`. На боці nic.ua має стояти `CNAME`-запис
на `danylokob.github.io`. Після цього в Settings → Pages вмикається
**Enforce HTTPS**.

## Деталі

- Шрифти самохостяться — жодних звернень до Google Fonts.
- Шляхи до ассетів **відносні**, тому сайт однаково працює і на
  `spbt.pp.ua`, і на `danylokob.github.io/spbt-site/` (до під'єднання домену).
  У `404.html` шляхи кореневі — інакше вона зламається на вкладених URL.
- Без JS сторінка лишається повністю читабельною: анімація появи вимикається
  через failsafe у `<head>`.
