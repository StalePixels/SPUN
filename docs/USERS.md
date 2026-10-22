# Using SPUN on the Next

SPUN is a package manager for the ZX Spectrum Next. It finds apps in the SPUN catalogue, installs them, and updates the apps it installed. The program on the Next is the dot command `.spun`.

## Install SPUN

There are two ways. Both start on the front page of the SPUN site.

**With `.nbnget`.** If your Next already has `.nbnget`, run the command the front page shows:

```
.nbnget /dot/spun : ../spun get spun
```

The front page describes it as downloading the SPUN dot command and bootstrapping the full installer.

**With the zip.** Use "Download the SPUN zip" on the front page, and unpack the zip on the SD card of your Next. Then run `spun.bas`. The menu moves `spun.dot` to `C:/dot/spun`, so `.spun` runs from any directory.

The browser needs core 3.02.00 or later.

## What is in the SPUN zip

- `spun.dot`: the dot command.
- `spun.bas`: the SPUN menu. Its source is `src/client/zip/spun.txt`.
- `spun.gde`: the guide. Open it from the menu, or with `.guide spun.gde`.
- `README.txt`: a short note, with the credit for the DEFLATE code.

The menu offers: browse the catalogue, update installed apps, install an app by its id or alias, and read the guide.

## The `.spun` command

The commands and options are in `src/client/dot/help.txt`, which `.spun` shows when you run it with a wrong option. The guide, `src/client/zip/spun.gde`, explains each one. Read those two; this page does not copy them.

In short: `.spun find TEXT`, `.spun info APPID`, `.spun get APPID` and `.spun update`. With no command, `.spun` opens the SPUN browser. `APPID` can also be an alias. `get featured` installs the app that the site currently features.

## The browser

Run `.spun` with no command, or choose "Browse the catalogue" in the menu.

- **The list.** It shows the apps in the catalogue with their id, title, publisher, version and download count. Move with the cursor keys and open an app with ENTER or a click. The buttons are Prev, Next, Search, Help and Quit. Help shows the same text as `help.txt`.
- **The app screen.** It shows the details of the app, its releases, and its screenshots (keys 1 to 5 show one in full). ENTER or a click on a release shows its changelog. The buttons are Back, Changelog, Install and Quit.
- **Install.** Install asks where to put the app, as described below, and then installs it. If a file in the app already exists, SPUN asks whether to overwrite it once, overwrite all, or cancel.
- **Updates.** When the browser starts and installed apps have a newer release, it offers to update them or ignore them.

## Where apps install

The first time you install an app, SPUN offers the install directory that the publisher suggested, on drive `C:`. You can accept it, or choose another directory in the NextZXOS file browser. A RAM disk or a disk image cannot hold an app.

SPUN remembers the directory. An update goes to the same place. If the installed release is the latest, SPUN asks before it installs the same release again. If the installed release is newer than the latest on the server, it refuses.

Where the app has dot commands, SPUN moves them to `C:/dot/` after the install.

## The catalogue file

SPUN keeps the list of what it installed in the text file `C:/sys/spun.cat`. Each line has the app id, the serial of the installed release in four hex digits, the version, and the install directory, separated by spaces:

```
abc123 0003 1.2 C:/apps/myapp
```

Empty lines and lines that start with `#` or `;` are ignored. If a line is bad, `.spun` stops and names the line number before it changes anything. Deleting a line makes SPUN forget that app: it is no longer updated. The files of the app stay.

## The web site

The catalogue is also on the web site, at `/catalogue`. You can read it without an account.

- Search with the search box, and filter by category.
- Open an app to see its details, and to download the latest release as a zip. A download from the web site does not count in the download count.
- Every page also exists as Markdown: add `.md` to the address.
- With an account you can save apps. The save button is on each app and in the catalogue list. Your saved apps are on the "My Apps" tab of your account page, `/me/apps`.
