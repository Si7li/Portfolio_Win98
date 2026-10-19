# Portfolio 98

My personal portfolio, built as a Windows 98 desktop. Projects, experience, studies and my resume open as draggable windows, and DOOM is playable from the desktop.

**Live:** https://si7li.github.io/Portfolio_Win98/

![Desktop with the welcome screen](screenshots/01-desktop-welcome.png)

## Screenshots

| | |
|---|---|
| ![My Projects folder with a project window](screenshots/02-projects.png) | ![Start menu over the Experience window](screenshots/03-start-menu.png) |
| ![Light theme with About Me and In Progress](screenshots/04-light-theme.png) | ![DOOM running in a window](screenshots/05-doom.png) |

On phones, windows open full screen one at a time:

<img src="screenshots/06-mobile.png" alt="Phone view: desktop icons and the Experience window" width="435">

## Features

- Draggable windows with minimize, maximize and close, a taskbar, a Start menu and a clock
- Every window has its own link, for example [`#projects`](https://si7li.github.io/Portfolio_Win98/#projects)
- Dark theme by default, with a light theme toggle in the tray
- Playable DOOM (shareware) in a DOS emulator, loaded only when its window opens
- Works on phones and with the keyboard
- Plain HTML, CSS and JavaScript: no frameworks and no build step

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly works too, except for DOOM, which needs a web server.

## Credits

- Windows 98 icons from [alexh/vintage-icons](https://github.com/alexh/vintage-icons) (originally by Microsoft)
- DOOM shareware v1.9 by id Software, run with [js-dos](https://github.com/caiiiycuk/js-dos) (GPL-2.0). See [`doom/README.txt`](doom/README.txt)
