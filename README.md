# <p align="center"><b> 🎬 yt2json </b><br>Lightweight YouTube scraper </p>
<p align="center">
  <a href="https://www.npmjs.com/package/yt2json">
    <img src="https://img.shields.io/npm/v/yt2json.svg" alt="npm version">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/npm/l/yt2json.svg" alt="license">
  </a>
</p>


A simple **YouTube scraper** originally based on [zyrouge/node-youtube-ext](https://github.com/zyrouge/node-youtube-ext),  updated and fixed to work with the latest YouTube changes.

---

## ✨ Features

- 📺 Fetch **video information**
- 👤 Fetch **channel information**
- 🔑 **No API key required**
---

## 📦 Installation

```bash
npm install yt2json
````

---

## 🚀 Usage

### CommonJS

```js
const yt2json = require("yt2json");
```

### ES Modules

```js
import yt2json from "yt2json";
```

### Named imports

```js
import { /* functions */ } from "yt2json";
```

---

## 📖 Examples

Check out usage examples here:
👉 [`/examples`](./examples)

### `channelInfo(url, options?)`

Returns the channel's metadata (name, id, avatar, banner, subscribers, links, counters,
`joinedDate`).

```js
const channel = await yt2json.channelInfo("https://www.youtube.com/@mkbhd");
// channel.joinedDate -> "Mar 21, 2008"
```

Pass `includeVideos` to also fetch the channel's `videos`, `shorts` and `streams` — each
into its own array. Every page is followed to the end, so a large channel takes noticeably
longer and issues many requests:

```js
const channel = await yt2json.channelInfo(url, { includeVideos: true });

channel.videos[0];
// {
//   title: "Galaxy Z Fold 8 Review: Honeymoon's Over",
//   id: "Z6z_feacXW8",
//   url: "https://youtu.be/Z6z_feacXW8",
//   thumbnail: "https://i.ytimg.com/vi_webp/Z6z_feacXW8/maxresdefault.webp",
//   duration: { text: "11:36", seconds: 696 },
//   views: "3.3M",
//   publishedTime: "4 days ago"
// }
```

`streams` holds past, ongoing and scheduled live streams (the channel's **Live** tab) using
the same shape as `videos`:

```js
channel.streams[0];
// {
//   title: "Live Video from the International Space Station",
//   id: "M3HKLzjvKPc",
//   ...
//   duration: { text: "LIVE", seconds: null }
// }
```

Without `includeVideos`, `videos`, `shorts` and `streams` come back empty and the extra
pages are never requested. Tabs the channel doesn't have are skipped too, so a channel
without shorts or live streams costs no extra requests. The flag also accepts the raw
string of a query parameter (`channelInfo(url, req.query.includeVideos)`).

`duration.seconds` is `null` for entries without a numeric duration badge — `"LIVE"` and
`"Upcoming"` streams keep the badge in `duration.text` — and `views` is absent for videos
YouTube does not report a view count for.

> **Note:** `videos[].thumbnail` and `streams[].thumbnail` are built as
> `https://i.ytimg.com/vi_webp/<id>/maxresdefault.webp`. YouTube only generates that size
> for uploads that were high-resolution to begin with, so older videos return **404** on it
> — fall back to `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, which always exists.
> `shorts[].thumbnail` comes from the page payload instead, since a short's real preview is
> vertical.

---

## 🔗 Links

* 📚 Documentation: [https://youtube-ext.js.org](https://youtube-ext.js.org)
  *(based on original project, custom docs coming soon)*
* 📦 NPM: [https://www.npmjs.com/package/yt2json](https://www.npmjs.com/package/yt2json)
* 💻 GitHub: [https://github.com/uniqbtw/yt2json](https://github.com/uniqbtw/yt2json)

---

## ⚠️ Disclaimer

This project is not affiliated with YouTube.
Use responsibly and respect YouTube's Terms of Service.

---

## 📄 License

Licensed under the **MIT License**.
See [LICENSE](./LICENSE) for details.

