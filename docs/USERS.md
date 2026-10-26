# Using SPUN on the Next

SPUN is a package manager for the ZX Spectrum Next. It finds apps in the SPUN catalogue, installs them, and updates the apps it installed. The program on the Next is the dot command `.spun`.

## Install SPUN

There are two ways. Both start on the front page of the SPUN site.

**With `.nbnget`.** If your Next already has `.nbnget`, run the command the front page shows:

```
.nbnget /dot/spun : ../spun get spun
```

It downloads `.spun` into the current directory, then runs it to install SPUN.

**With the zip.** Use "Download the SPUN zip" on the front page, and unpack the zip on the SD card of your Next. Then run `spun.bas`. The menu moves `spun.dot` to `C:/dot/spun`, so `.spun` runs from any directory.

The browser needs core 3.02.00 or later.

## What is in the SPUN zip

- `spun.dot`: the dot command.
- `spun.bas`: the SPUN menu. Its source is `src/client/zip/spun.txt`.
- `spun.gde`: the guide. Open it from the menu, or with `.guide spun.gde`.
- `README.txt`: a short note, with the credit for the DEFLATE code.

The menu offers: browse the catalogue, update installed apps, install an app by its id or alias, and read the guide.

## The `.spun` command

The commands and options are in `src/client/dot/help.txt`, which `.spun` shows when you run it with a wrong option. The guide, `src/client/zip/spun.gde`, explains each one.

In short: `.spun find TEXT`, `.spun info APPID`, `.spun get APPID` and `.spun update`. With no command, `.spun` opens the SPUN browser. `APPID` can also be an alias. `get featured` installs the app that the site currently features.

## The browser

Run `.spun` with no command, or choose "Browse the catalogue" in the menu.

- **The list.** It shows the apps in the catalogue with their id, title, publisher, version and download count. Move with the cursor keys and open an app with ENTER or a click. The buttons are Prev, Next, Search, Category, Help and Quit. A button that does nothing on the current screen is grey, and its key and click do nothing. Help shows the same text as `help.txt`.
- **Search.** Search (key S) opens a box at the bottom of the screen. ENTER searches; EDIT or BREAK closes the box. Once the mouse has moved, a click closes the box and acts on what you clicked.
- **Category.** Category (key C) shows the categories in place of the list. Choose one with the cursor keys and ENTER, or a click. "All" removes the filter. Back (key B), EDIT or BREAK returns to the list unchanged. With a category chosen, the list and a search show only the apps in it, and the status line names it.
- **The pointer.** The mouse pointer hides when you press a key, and comes back when the mouse moves.
- **The app screen.** It shows the details of the app, its releases, and its screenshots (keys 1 to 5 show one in full). ENTER or a click on a release shows its changelog. The buttons are Back, Changelog, Install, Quit and Advanced.
- **Install.** Install asks where to put the app, as described below, and then installs it. If a file in the app already exists, SPUN asks whether to overwrite it once, overwrite all, or cancel.
- **Updates.** When the browser starts and installed apps have a newer release, it offers to update them or ignore them.
- **Advanced.** Clear cache (key L) deletes the cached screenshots of the app.

## The screenshot cache

SPUN keeps each screenshot it downloads in `C:/tmp/spun/<appid>/`, and shows it from the card the next time. It downloads a screenshot again when the publisher changes it, or when you delete its file from the cache.

## Where apps install

The first time you install an app, SPUN offers the install directory that the publisher suggested, on drive `C:`. You can accept it, or choose another directory in the NextZXOS file browser. A RAM disk or a disk image cannot hold an app.

SPUN remembers the directory. An update goes to the same place. If the installed release is the latest, SPUN asks before it installs the same release again. If the installed release is newer than the latest on the server, SPUN does not install.

If the app has dot commands, SPUN moves them to `C:/dot/` after the install.

## The catalogue file

SPUN keeps the list of what it installed in the text file `C:/sys/spun.cat`. Each line has the app id, the serial of the installed release in four hex digits, the version, and the install directory, separated by spaces:

```
abc123 0003 1.2 C:/apps/myapp
```

SPUN ignores empty lines and lines that start with `#` or `;`. If a line is bad, `.spun` stops and names the line number before it changes anything. If you delete a line, SPUN no longer updates that app. The files of the app stay.

## The web site

The catalogue is also on the web site, at `/catalogue`. You can read it without an account.

- Search with the search box, and filter by category.
- Open an app to see its details, and to download the latest release as a zip. The download count does not include downloads from the web site.
- Every page also exists as Markdown: add `.md` to the address.
- With an account you can save apps. The save button is on each app and in the catalogue list. Your saved apps are on the "My Apps" tab of your account page, `/me/apps`.
