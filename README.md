# Blue Archive — Ocean Research

Mobile-first Three.js exploration game using the supplied map, player, helm, media, sound, and water-normal assets.

## Run

```powershell
npm start
```

Then open <http://localhost:5173>. A local server is required because browsers do not load GLB modules correctly from a `file://` URL.

## Content editing

Trigger popup content lives in the `<template>` blocks near the bottom of `index.html`. Replace the sample media paths or the paired `data-ko` / `data-en` strings there. Replace the placeholder Google Forms URL in `completion-template` before deployment.
