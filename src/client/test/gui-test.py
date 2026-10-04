#!/usr/bin/env python3
"""Helpers for mame-gui.sh, the MAME test of the .spun GUI.

usage: gui-test.py rows HOST PORT < SCENARIO.in > SCENARIO
       gui-test.py pointers SCENARIO RUNDIR
       gui-test.py layer2 SCENARIO RUNDIR HOST PORT DATADIR
       gui-test.py proxy LISTEN HOST PORT SLOW LOG
       gui-test.py drop LISTEN HOST PORT STAGE LOG

rows   copies the scenario and expands each line "@ROWS T COMMAND": it sends
       COMMAND (for example "SPLIST 2" or "SPFIND 1 zebra") to the SPUNServer
       at HOST:PORT, and writes mane-harness "expect" lines for time T that
       check tilemap rows 3 to 25 against the reply: the heading, one row for
       each app as BANK_gui/entry_draw.c draws it, with the selected entry
       (the first) in the bar colours, blank rows after the last app, and the
       status line. The tilemap is found by the title bar,
       "SPUN" at row 1 column 1 with attribute 4. A line "@POINTER T X Y"
       becomes a "dump" at T of the pointer position, X and then Y in 16 bits
       each at $BFD8 (gui/isr.asm), named after X and Y. "@SHOWN T" and
       "@HIDDEN T" become a snapshot at T, and a dump named after the line.
       A line "@TEXT T ROW COL ATTR TEXT" checks only the cells of TEXT at
       ROW and COL, with attribute ATTR (a number), for example a line of a
       modal box (gui/modal_ask.c).

pointers  checks the pointer lines of the expanded SCENARIO against its run
       folder RUNDIR: the position in each @POINTER dump, and whether the
       snapshot of each @SHOWN or @HIDDEN line has pixels of a colour that
       only the pointer has. It prints a line for each, and exits with 1 if
       one is missing or wrong.

layer2 checks each "@LAYER2" dump of the expanded SCENARIO in RUNDIR. A page
       dump must hold each thumbnail file of DATADIR/<user>/thumb/<app>/<slot>
       in its place (BANK_app/thumb_rect.c) for the slots that SPINFO lists,
       the placeholder (BANK_screen/placeholder_draw.c) in the others, 0
       everywhere else, the default palette, and 320x256 mode. A full dump
       must hold the pixels and palette of DATADIR/<user>/nxi/<app>/<slot>, in
       the mode of its size. A splash dump, after the splash, must hold the
       splash's last picture (BANK_screen/splash.c), with Layer 2 off and the
       tilemap on. It prints a line for each and exits with 1 if one is wrong
       or missing.

proxy  listens on 127.0.0.1:LISTEN and passes each connection on to
       HOST:PORT. It writes each command line that the client sends to LOG,
       and each error reply of the server, such as NoApp_ERROR, after "< ".
       The reply to the first command that starts with SLOW goes to the
       client one byte every 5 ms, until the client sends again, so that the
       read takes some seconds and a scenario can look at the machine while
       it runs.

drop   listens on 127.0.0.1:LISTEN and passes each connection on to
       HOST:PORT, as proxy does, but closes the first connection at STAGE:
       connect  as soon as it is made, before the client sends anything;
       request  when the client's first command line arrives, which is not
                passed on, so no reply comes;
       midblock in the middle of the first block of a file: after the client
                acknowledges the file header, 1000 bytes of the block pass;
       between  between blocks: when the client acknowledges the first whole
                block, which is not passed on.
       Later connections, such as the ESP8266's own reconnect in passthrough
       mode, pass untouched. It writes each command line and "dropped STAGE"
       to LOG.
"""
import os
import re
import socket
import sys
import threading
import time

COLUMNS = 80
MARKER = 'S\\x04P\\x04U\\x04N\\x04'
# The marker is row 1, column 1
MARKER_CELL = COLUMNS + 1

ATTR_TEXT = 0x00
ATTR_KEY = 0x02
ATTR_BAR = 0x04
ATTR_BAR_KEY = 0x06
ATTR_BLACK = 0x08

HEAD_ROW = 3
LIST_ROW = 4
LIST_ROWS = 20
STATUS_ROW = 25
COL_ID, COL_TITLE, COL_USER, COL_VERSION, COL_DOWNLOADS = 1, 8, 41, 58, 69
VERSION_WIDTH = 10
HEADING = 'App    Title                            Publisher        Version     Downloads'

TAG_TOTAL, TAG_PAGE, TAG_PAGES, TAG_APP = 0x01, 0x02, 0x03, 0x10
TAG_APP_ID, TAG_USERNAME, TAG_TITLE, TAG_VERSION, TAG_DOWNLOADS = 0x11, 0x12, 0x13, 0x15, 0x16
TAG_SERIAL, TAG_DATE, TAG_RELEASE, TAG_CATEGORY = 0x14, 0x17, 0x18, 0x19
TAG_SCREENSHOT, TAG_SLOT, TAG_WIDTH = 0x1A, 0x1B, 0x1C
TAG_DESCRIPTION, TAG_CHANGELOG = 0x80, 0x81
LONG_TAG = 0x80

TITLE_ROW, BUTTON_ROW = 1, 30

# The app page (BANK_app/app.h) and its thumbnail sizes (src/web/src/lib/thumbs.ts)
SLOTS = 5
THUMB_BIG = (128, 96)
THUMB_SMALL = (64, 48)
THUMB_X, THUMB_Y, THUMB_GAP = 4, 16, 4
THUMB_PER_COLUMN = THUMB_BIG[1] // THUMB_SMALL[1]
THUMB_COLUMNS = (SLOTS - 2) // THUMB_PER_COLUMN + 1
THUMB_RIGHT = THUMB_X + THUMB_BIG[0] + THUMB_COLUMNS * (THUMB_GAP + THUMB_SMALL[0])
INFO_COL = THUMB_RIGHT // 4 + 1
TEXT_ROW = (THUMB_Y + THUMB_BIG[1]) // 8 + 1
TEXT_END = STATUS_ROW - 1
REL_COL = 52
COL_REL_DATE = REL_COL + 17
REL_BAR_COL = REL_COL - 1
REL_BAR_WIDTH = COLUMNS - REL_BAR_COL
LEFT_WIDTH = REL_BAR_COL - 2
REL_HEAD_ROW = TEXT_ROW
REL_ROW = REL_HEAD_ROW + 1
REL_ROWS = TEXT_END - REL_ROW
HINT_ROW = 27
HINT = 'Up/Down: release   ENTER or click: changelog   1-5 or click: picture'
CLOG_ROW = 5
CLOG_ROWS = BUTTON_ROW - 1 - CLOG_ROW
TEXT_WIDTH = COLUMNS - 2
APP_BUTTONS = [(1, 'b', 'Back'), (8, 'c', 'Changelog'), (31, 'q', 'Quit'), (20, 'i', 'Install')]


def read_exact(sock, n):
    data = b''
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise SystemExit(f'server closed the connection after {len(data)} of {n} bytes')
        data += chunk
    return data


def fields(block):
    at = 0
    while at < len(block):
        tag = block[at]
        length = block[at + 1]
        at += 2
        if tag >= LONG_TAG:
            length |= block[at] << 8
            at += 1
        yield tag, block[at:at + length]
        at += length


def number(value):
    return int.from_bytes(value, 'little')


def reply_block(host, port, command):
    with socket.create_connection((host, port), timeout=10) as sock:
        sock.sendall(command.encode() + b'\n')
        head = read_exact(sock, 1)
        if head[0] != 2:
            raise SystemExit(f'{command}: server said {head + sock.recv(100)!r}')
        version, = read_exact(sock, 1)
        if version != 1:
            raise SystemExit(f'{command}: SPUN format version {version}')
        size = number(read_exact(sock, 2))
        block = read_exact(sock, size)
        checksum, = read_exact(sock, 1)
        if checksum != sum(block) & 0xFF:
            raise SystemExit(f'{command}: bad checksum')
    return block


def text(value):
    return value.decode('latin-1')


def request(host, port, command):
    block = reply_block(host, port, command)
    reply = {'total': 0, 'page': 0, 'pages': 0, 'apps': []}
    for tag, value in fields(block):
        if tag == TAG_TOTAL:
            reply['total'] = number(value)
        elif tag == TAG_PAGE:
            reply['page'] = number(value)
        elif tag == TAG_PAGES:
            reply['pages'] = number(value)
        elif tag == TAG_APP:
            app = {'id': '', 'username': '', 'title': '', 'version': '', 'downloads': 0}
            for inner, data in fields(value):
                if inner == TAG_APP_ID:
                    app['id'] = data.decode('latin-1')
                elif inner == TAG_USERNAME:
                    app['username'] = data.decode('latin-1')
                elif inner == TAG_TITLE:
                    app['title'] = data.decode('latin-1')
                elif inner == TAG_VERSION:
                    app['version'] = data.decode('latin-1')
                elif inner == TAG_DOWNLOADS:
                    app['downloads'] = number(data)
            reply['apps'].append(app)
    return reply


def info(host, port, appid):
    """The SPINFO page 1 of appid, as BANK_net/gui_info.c reads it."""
    app = {'id': appid, 'username': '', 'title': '', 'description': '', 'downloads': 0, 'total': 0,
           'categories': [], 'shots': {}, 'releases': []}
    for tag, value in fields(reply_block(host, port, f'SPINFO {appid} 1')):
        if tag == TAG_TOTAL:
            app['total'] = number(value)
        elif tag == TAG_USERNAME:
            app['username'] = text(value)
        elif tag == TAG_TITLE:
            app['title'] = text(value)
        elif tag == TAG_DESCRIPTION:
            app['description'] = text(value)
        elif tag == TAG_DOWNLOADS:
            app['downloads'] = number(value)
        elif tag == TAG_CATEGORY:
            app['categories'].append(text(value))
        elif tag == TAG_SCREENSHOT:
            inner = dict(fields(value))
            app['shots'][number(inner[TAG_SLOT])] = number(inner[TAG_WIDTH])
        elif tag == TAG_RELEASE:
            inner = dict(fields(value))
            app['releases'].append((number(inner[TAG_SERIAL]), text(inner[TAG_VERSION]), text(inner[TAG_DATE])))
    return app


def changelog(host, port, appid, serial):
    reply = {'version': '', 'date': '', 'changelog': ''}
    for tag, value in fields(reply_block(host, port, f'SPCLOG {appid} {serial}')):
        if tag == TAG_VERSION:
            reply['version'] = text(value)
        elif tag == TAG_DATE:
            reply['date'] = text(value)
        elif tag == TAG_CHANGELOG:
            reply['changelog'] = text(value)
    return reply


def wrap(value, width, rows):
    """BANK_app/text_wrap.c: the lines it draws."""
    lines = []
    while value and len(lines) != rows:
        length = 0
        while length < len(value) and value[length] != '\n' and length != width:
            length += 1
        cut = length
        if length == width and length < len(value) and value[length] not in ' \n':
            while cut and value[cut] != ' ':
                cut -= 1
            if not cut:
                cut = length
        lines.append(value[:cut])
        value = value[cut:]
        if value[:1] in (' ', '\n') and value:
            value = value[1:]
    return lines


class Screen:
    """Tilemap rows as (character, attribute) cells."""

    def __init__(self):
        self.rows = {row: [(0x20, ATTR_TEXT)] * COLUMNS for row in range(TITLE_ROW + 1, BUTTON_ROW + 1)}

    def text(self, col, row, value, attr=ATTR_TEXT):
        for i, ch in enumerate(value):
            self.rows[row][col + i] = (ord(ch), attr)

    def attr(self, col, row, count, attr):
        for i in range(col, col + count):
            self.rows[row][i] = (self.rows[row][i][0], attr)

    def buttons(self, buttons):
        for col, key, label in buttons:
            self.text(col, BUTTON_ROW, ' ' + label + ' ', ATTR_BAR)
            at = label.lower().index(key)
            self.attr(col + 1 + at, BUTTON_ROW, 1, ATTR_BAR_KEY)

    def lines(self, t):
        return [expect_line(t, row, cells) for row, cells in sorted(self.rows.items())]


def thumb_rect(slot):
    """BANK_app/thumb_rect.c: x, y, width, height in 320x256 Layer 2."""
    if slot == 1:
        return THUMB_X, THUMB_Y, *THUMB_BIG
    small = slot - 2
    x = THUMB_X + THUMB_BIG[0] + THUMB_GAP + (small // THUMB_PER_COLUMN) * (THUMB_SMALL[0] + THUMB_GAP)
    y = THUMB_Y + (small % THUMB_PER_COLUMN) * THUMB_SMALL[1]
    return x, y, *THUMB_SMALL


def app_page(t, host, port, appid, sel):
    app = info(host, port, appid)
    screen = Screen()
    for slot in range(1, SLOTS + 1):
        x, y, w, h = thumb_rect(slot)
        for row in range(h // 8):
            screen.attr(x // 4, y // 8 + row, w // 4, ATTR_BLACK)
    row = THUMB_Y // 8
    screen.text(INFO_COL, row, 'Downloads', ATTR_KEY)
    screen.text(INFO_COL, row + 1, str(app['downloads']))
    screen.text(INFO_COL, row + 3, 'App id', ATTR_KEY)
    screen.text(INFO_COL, row + 4, appid)
    screen.text(INFO_COL, row + 6, 'Releases', ATTR_KEY)
    screen.text(INFO_COL, row + 7, str(app['total']))
    row = TEXT_ROW
    screen.text(1, row, app['title'], ATTR_KEY)
    screen.text(1, row + 1, f'by {app["username"]}')
    row += 2
    categories = ', '.join(app['categories']) or 'none'
    for line in wrap(f'Categories: {categories}', LEFT_WIDTH, 2):
        screen.text(1, row, line)
        row += 1
    for n, line in enumerate(wrap(app['description'], LEFT_WIDTH, TEXT_END - row)):
        screen.text(1, row + n, line)
    screen.text(REL_COL, REL_HEAD_ROW, 'Version', ATTR_KEY)
    screen.text(COL_REL_DATE, REL_HEAD_ROW, 'Date', ATTR_KEY)
    top = sel - REL_ROWS + 1 if sel >= REL_ROWS else 0
    for n, (_, version, date) in enumerate(app['releases'][top:top + REL_ROWS]):
        screen.text(REL_COL, REL_ROW + n, version)
        screen.text(COL_REL_DATE, REL_ROW + n, date)
    if app['releases']:
        screen.attr(REL_BAR_COL, REL_ROW + sel - top, REL_BAR_WIDTH, ATTR_BAR)
    screen.text(1, HINT_ROW, HINT)
    screen.buttons(APP_BUTTONS)
    head = f'# app page of {appid}: screenshots {sorted(app["shots"].items())}, {len(app["releases"])} releases, release {sel} selected'
    return [head] + screen.lines(t)


def clog_page(t, host, port, appid, serial):
    app = info(host, port, appid)
    reply = changelog(host, port, appid, serial)
    screen = Screen()
    screen.text(1, TITLE_ROW + 2, f'Changelog of {app["title"]} {reply["version"]}, {reply["date"]}', ATTR_KEY)
    if reply['changelog']:
        for n, line in enumerate(wrap(reply['changelog'], TEXT_WIDTH, CLOG_ROWS)):
            screen.text(1, CLOG_ROW + n, line)
    else:
        screen.text(1, CLOG_ROW, 'This release has no changelog.')
    screen.buttons(APP_BUTTONS[:1])
    return [f'# changelog of {appid} serial {serial}'] + screen.lines(t)


def row_cells(texts, attr=ATTR_TEXT):
    cells = [(0x20, ATTR_TEXT)] * COLUMNS
    for col, text in texts:
        for i, ch in enumerate(text):
            cells[col + i] = (ord(ch), attr)
    return cells


def expect_line(t, row, cells):
    offset = (row * COLUMNS - MARKER_CELL) * 2
    hexes = ' '.join(f'{c:02x} {a:02x}' for c, a in cells)
    return f'expect {t} {MARKER} {offset} {hexes}'


def status(command, reply):
    words = command.split(' ', 2)
    if words[0] == 'SPFIND':
        if not reply['total']:
            return f'Search "{words[2]}": 0 found'
        return f'Search "{words[2]}": {reply["total"]} found, page {reply["page"]} of {reply["pages"]}'
    return f'Catalogue: {reply["total"]} apps, page {reply["page"]} of {reply["pages"]}'


def rows(t, command, host, port, sel=0):
    reply = request(host, port, command)
    lines = [f'# {command}: {reply["total"]} in all, page {reply["page"]} of {reply["pages"]}, '
             f'{len(reply["apps"])} here: ' + ' '.join(app['id'] for app in reply['apps'])]
    lines.append(expect_line(t, HEAD_ROW, row_cells([(1, HEADING)], ATTR_KEY)))
    for n in range(LIST_ROWS):
        if n < len(reply['apps']):
            app = reply['apps'][n]
            cells = row_cells([
                (COL_ID, app['id']),
                (COL_TITLE, app['title']),
                (COL_USER, app['username']),
                (COL_VERSION, app['version'][:VERSION_WIDTH]),
                (COL_DOWNLOADS, f'{app["downloads"]:10d}'),
            ])
        else:
            cells = row_cells([])
        if n == sel and n < len(reply['apps']):
            cells = [(c, ATTR_BAR) for c, _ in cells]
        lines.append(expect_line(t, LIST_ROW + n, cells))
    lines.append(expect_line(t, STATUS_ROW, row_cells([(1, status(command, reply))])))
    return lines


POINTER = 0xBFD8


def expand(host, port):
    for line in sys.stdin:
        if line.startswith('@ROWS '):
            _, t, command = line.rstrip('\n').split(' ', 2)
            print('\n'.join(rows(t, command, host, int(port))))
        elif line.startswith('@ROWSEL '):
            _, t, sel, command = line.rstrip('\n').split(' ', 3)
            print('\n'.join(rows(t, command, host, int(port), int(sel))))
        elif line.startswith('@APP '):
            _, t, appid, *sel = line.split()
            print('\n'.join(app_page(t, host, int(port), appid, int(sel[0]) if sel else 0)))
        elif line.startswith('@CLOG '):
            _, t, appid, serial = line.split()
            print('\n'.join(clog_page(t, host, int(port), appid, serial)))
        elif line.startswith('@LAYER2 '):
            _, t, name, *what = line.split()
            print(f'layer2 {t} {name}')
            print(f'#layer2 {name} {" ".join(what)}')
        elif line.startswith('@POINTER '):
            _, t, x, y = line.split()
            print(f'dump {t} {POINTER:#06x} 4 pointer-{t}-{x}-{y}')
        elif line.startswith('@TEXT '):
            _, t, row, col, attr, value = line.rstrip('\n').split(' ', 5)
            offset = (int(row) * COLUMNS + int(col) - MARKER_CELL) * 2
            hexes = ' '.join(f'{ord(c):02x} {int(attr, 0):02x}' for c in value)
            print(f'# {value}')
            print(f'expect {t} {MARKER} {offset} {hexes}')
        elif line.startswith(('@SHOWN ', '@HIDDEN ')):
            word, t = line.split()
            print(f'snap {t}')
            print(f'dump {t} {POINTER:#06x} 4 {word[1:].lower()}-{t}')
        else:
            sys.stdout.write(line)


# The colours of the tilemap (BANK_screen/screen_on.c) in MAME's snapshots: the
# FoaK blue, white, yellow and red, and the black of the fallback colour in the
# border around it. The pointer has others.
# The GUI's colours and the splash's green and cyan; the pointer has none of them
GUI_COLOURS = {(0, 0, 182), (255, 255, 255), (255, 255, 0), (255, 0, 0), (0, 0, 0), (0, 255, 0), (0, 255, 255)}


def pointer_pixels(rundir, t):
    from PIL import Image
    path = os.path.join(rundir, 'snap', f'snap-{float(t):06.1f}.png')
    if not os.path.exists(path):
        return None
    return sum(1 for pixel in Image.open(path).convert('RGB').getdata() if pixel not in GUI_COLOURS)


def pointers(scenario, rundir):
    failed = False
    names = re.findall(r'^dump \S+ \S+ 4 ((?:pointer|shown|hidden)-\S+)$', open(scenario).read(), re.MULTILINE)
    if not names:
        print('pointer   no checks in the scenario')
        return 1
    for name in names:
        if not name.startswith('pointer-'):
            word, t = name.split('-')
            count = pointer_pixels(rundir, t)
            verdict = 'MISSING' if count is None else 'MATCH' if (count > 0) == (word == 'shown') else 'DIFFERENT'
            failed |= verdict != 'MATCH'
            print(f'pointer   t={t} want {word} got {count} pointer pixels {verdict}')
            continue
        _, t, x, y = name.split('-')
        path = os.path.join(rundir, f'dump-{name}.bin')
        if not os.path.exists(path):
            print(f'pointer   t={t} want {x},{y} MISSING')
            failed = True
            continue
        data = open(path, 'rb').read()
        got = (int.from_bytes(data[0:2], 'little'), int.from_bytes(data[2:4], 'little'))
        verdict = 'MATCH' if got == (int(x), int(y)) else 'DIFFERENT'
        failed |= verdict != 'MATCH'
        print(f'pointer   t={t} want {x},{y} got {got[0]},{got[1]} {verdict}')
    return 1 if failed else 0


# Letters of the Sinclair ROM font, and the default Layer 2 palette's red,
# yellow, green and cyan
ROM_GLYPHS = {
    'A': (0x00, 0x3C, 0x42, 0x42, 0x7E, 0x42, 0x42, 0x00),
    'D': (0x00, 0x78, 0x44, 0x42, 0x42, 0x44, 0x78, 0x00),
    'E': (0x00, 0x7E, 0x40, 0x7C, 0x40, 0x40, 0x7E, 0x00),
    'I': (0x00, 0x3E, 0x08, 0x08, 0x08, 0x08, 0x3E, 0x00),
    'L': (0x00, 0x40, 0x40, 0x40, 0x40, 0x40, 0x7E, 0x00),
    'N': (0x00, 0x42, 0x62, 0x52, 0x4A, 0x46, 0x42, 0x00),
    'P': (0x00, 0x7C, 0x42, 0x42, 0x7C, 0x40, 0x40, 0x00),
    'S': (0x00, 0x3C, 0x40, 0x3C, 0x02, 0x42, 0x3C, 0x00),
    'T': (0x00, 0xFE, 0x10, 0x10, 0x10, 0x10, 0x10, 0x00),
    'U': (0x00, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C, 0x00),
    'X': (0x00, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x00),
}
PLACEHOLDER_GLYPHS = ROM_GLYPHS
PLACEHOLDER_COLOURS = {'S': 0xE0, 'P': 0xFC, 'U': 0x1C, 'N': 0x1F}
RAINBOW = (0xE0, 0xFC, 0x1C, 0x1F)
SPLASH_TOP = 96
SPLASH_WORDS = ('STALE', 'PIXELS', 'UPDATES', 'NEXTS')


def splash():
    """BANK_screen/splash.c at its end: in each 64 px column of 320x256 Layer
    2, rows 96-159 hold S, P, U and N at 8 times the ROM font, then the four
    words at the font's width and twice its height, each centred, in the
    rainbow colours; everything else is black. Offsets x * 256 + y."""
    out = bytearray(320 * 256)
    def put(x, y, value):
        out[x * 256 + SPLASH_TOP + y] = value
    for column, letter in enumerate('SPUN'):
        for line, bits in enumerate(ROM_GLYPHS[letter]):
            for bit in range(8):
                if bits & (0x80 >> bit):
                    for dx in range(8):
                        for dy in range(8):
                            put(column * 64 + bit * 8 + dx, line * 8 + dy, RAINBOW[column])
    for n, word in enumerate(SPLASH_WORDS):
        left = 256 + (64 - len(word) * 8) // 2
        for i, letter in enumerate(word):
            for line, bits in enumerate(ROM_GLYPHS[letter]):
                for bit in range(8):
                    if bits & (0x80 >> bit):
                        for dy in range(2):
                            put(left + i * 8 + bit, n * 16 + line * 2 + dy, RAINBOW[n])
    return bytes(out)


def placeholder(w, h):
    """BANK_screen/placeholder_draw.c: S P over U N at the largest whole scale
    that leaves room around the letters, the margins half the gap between the
    letters, across and down, on black."""
    scale = (h - 1) // 16
    cell = scale * 8
    across = (w - 2 * cell) // 4
    down = (h - 2 * cell) // 4
    out = {(x, y): 0 for x in range(w) for y in range(h)}
    for n, letter in enumerate('SPUN'):
        left = across + (n % 2) * (2 * across + cell)
        top = down + (n // 2) * (2 * down + cell)
        for line, bits in enumerate(PLACEHOLDER_GLYPHS[letter]):
            for bit in range(8):
                if bits & (0x80 >> bit):
                    for dx in range(scale):
                        for dy in range(scale):
                            out[left + bit * scale + dx, top + line * scale + dy] = PLACEHOLDER_COLOURS[letter]
    return out


DEFAULT_PALETTE = bytes(b for i in range(256) for b in (i, (i | i >> 1) & 1))


def nxi_palette(data):
    return bytes(b if n % 2 == 0 else b & 1 for n, b in enumerate(data[:512]))


def layer2_check(name, what, rundir, host, port, datadir):
    """The verdicts of one @LAYER2 dump."""
    paths = {k: os.path.join(rundir, f'dump-{name}-{k}') for k in ('ram.bin', 'pal.bin', 'regs.txt')}
    if not all(os.path.exists(p) for p in paths.values()):
        return [f'layer2    {name} MISSING']
    ram = open(paths['ram.bin'], 'rb').read()
    pal = open(paths['pal.bin'], 'rb').read()
    regs = dict(r.split('=') for r in open(paths['regs.txt']).read().split())
    kind, *rest = what
    out = []

    def verdict(label, ok):
        out.append(f'layer2    {name} {label} {"MATCH" if ok else "DIFFERENT"}')

    if kind == 'splash':
        verdict('pixels of the splash at its end', ram == splash())
        verdict(f'Layer 2 off and the tilemap on again (NR 0x69={regs["69"]}, NR 0x6B={regs["6b"]})',
                not int(regs['69'], 16) & 0x80 and regs['6b'] == 'c8')
        return out
    appid, *rest = rest
    app = info(host, port, appid)

    if kind == 'page':
        want = bytearray(len(ram))
        for slot in range(1, SLOTS + 1):
            x0, y0, w, h = thumb_rect(slot)
            if slot in app['shots']:
                thumb = open(os.path.join(datadir, app['username'], 'thumb', appid, str(slot)), 'rb').read()
                verdict(f'slot {slot} thumbnail file {w}x{h} ({len(thumb)} bytes)', len(thumb) == w * h)
                if len(thumb) != w * h:
                    continue
                pixels = {(x, y): thumb[y * w + x] for x in range(w) for y in range(h)}
                label = f'slot {slot} thumbnail'
            else:
                pixels = placeholder(w, h)
                label = f'slot {slot} placeholder'
            for (x, y), value in pixels.items():
                want[(x0 + x) * 256 + y0 + y] = value
            verdict(label, all(ram[(x0 + x) * 256 + y0 + y] == v for (x, y), v in pixels.items()))
        verdict('all other pixels 0', ram == bytes(want))
        verdict('default palette', pal == DEFAULT_PALETTE)
        verdict(f'mode 320x256, Layer 2 on (NR 0x70={regs["70"]}, NR 0x69={regs["69"]})',
                regs['70'] == '10' and int(regs['69'], 16) & 0x80)
    else:
        slot = rest[0]
        nxi = open(os.path.join(datadir, app['username'], 'nxi', appid, slot), 'rb').read()
        pixels = nxi[512:]
        verdict(f'slot {slot} pixels ({len(pixels)} bytes)', ram[:len(pixels)] == pixels)
        verdict(f'slot {slot} palette', pal == nxi_palette(nxi))
        mode = '10' if len(pixels) == 320 * 256 else '00'
        verdict(f'mode {"320x256" if mode == "10" else "256x192"}, Layer 2 on, tilemap off '
                f'(NR 0x70={regs["70"]}, NR 0x69={regs["69"]}, NR 0x6B={regs["6b"]})',
                regs['70'] == mode and int(regs['69'], 16) & 0x80 and not int(regs['6b'], 16) & 0x80)
    verdict(f'transparent and fallback black (NR 0x14={regs["14"]}, NR 0x4A={regs["4a"]})',
            regs['14'] == '00' and regs['4a'] == '00')
    return out


def layer2(scenario, rundir, host, port, datadir):
    checks = re.findall(r'^#layer2 (\S+) (.+)$', open(scenario).read(), re.MULTILINE)
    if not checks:
        print('layer2    no checks in the scenario')
        return 1
    lines = []
    for name, what in checks:
        lines += layer2_check(name, what.split(), rundir, host, port, datadir)
    print('\n'.join(lines))
    return 0 if all(line.endswith(' MATCH') for line in lines) else 1


def drop(listen, host, port, stage, log_path):
    log = open(log_path, 'a', buffering=1)
    state = {'dropped': False}
    lock = threading.Lock()

    def first():
        with lock:
            if state['dropped']:
                return False
            state['dropped'] = True
            return True

    def close_both(client, upstream):
        log.write(f'{time.time():.3f} dropped {stage}\n')
        for sock in (client, upstream):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()

    def serve(client, dropping):
        if dropping and stage == 'connect':
            close_both(client, socket.socket())
            return
        upstream = socket.create_connection((host, port))
        for sock in (client, upstream):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        seen = {'get': False, 'acks': 0, 'block': None}

        def from_client():
            line = b''
            try:
                while data := client.recv(4096):
                    line += data
                    lines = []
                    while b'\n' in line:
                        command, line = line.split(b'\n', 1)
                        lines.append(command.decode('latin-1').strip())
                    for command in lines:
                        if command:
                            log.write(f'{time.time():.3f} {command}\n')
                    if dropping and stage == 'request' and lines:
                        close_both(client, upstream)
                        return
                    if dropping and seen['get'] and any(c.startswith('!') for c in lines):
                        seen['acks'] += 1
                        if stage == 'midblock' and seen['acks'] == 1:
                            seen['block'] = 1000
                        if stage == 'between' and seen['acks'] == 2:
                            close_both(client, upstream)
                            return
                    if any(c.startswith('GET ') for c in lines):
                        seen['get'] = True
                    upstream.sendall(data)
            except OSError:
                pass
            upstream.close()

        def from_server():
            try:
                while data := upstream.recv(4096):
                    if seen['block'] is not None:
                        client.sendall(data[:seen['block']])
                        close_both(client, upstream)
                        return
                    client.sendall(data)
            except OSError:
                pass
            client.close()

        threading.Thread(target=from_client, daemon=True).start()
        threading.Thread(target=from_server, daemon=True).start()

    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', listen))
    server.listen()
    print(f'listening on 127.0.0.1:{listen}', flush=True)
    while True:
        client, _ = server.accept()
        serve(client, first())


def proxy(listen, host, port, slow, log_path):
    log = open(log_path, 'a', buffering=1)
    state = {'slowed': False}
    lock = threading.Lock()

    def serve(client):
        upstream = socket.create_connection((host, port))
        for sock in (client, upstream):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        trickle = threading.Event()

        def from_client():
            line = b''
            try:
                while data := client.recv(4096):
                    trickle.clear()
                    upstream.sendall(data)
                    line += data
                    while b'\n' in line:
                        command, line = line.split(b'\n', 1)
                        command = command.decode('latin-1').strip()
                        log.write(f'{time.time():.3f} {command}\n')
                        with lock:
                            if command.startswith(slow) and not state['slowed']:
                                state['slowed'] = True
                                trickle.set()
            except OSError:
                pass
            upstream.close()

        def from_server():
            try:
                while data := upstream.recv(4096):
                    if re.fullmatch(rb'[A-Za-z]+_ERROR\r\n', data):
                        log.write(f'{time.time():.3f} < {data.decode("latin-1").strip()}\n')
                    if trickle.is_set():
                        for byte in data:
                            client.sendall(bytes([byte]))
                            time.sleep(0.005)
                    else:
                        client.sendall(data)
            except OSError:
                pass
            client.close()

        threading.Thread(target=from_client, daemon=True).start()
        threading.Thread(target=from_server, daemon=True).start()

    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', listen))
    server.listen()
    print(f'listening on 127.0.0.1:{listen}', flush=True)
    while True:
        client, _ = server.accept()
        serve(client)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'rows':
        expand(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 4 and sys.argv[1] == 'pointers':
        sys.exit(pointers(sys.argv[2], sys.argv[3]))
    elif len(sys.argv) == 7 and sys.argv[1] == 'layer2':
        sys.exit(layer2(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), sys.argv[6]))
    elif len(sys.argv) == 7 and sys.argv[1] == 'drop':
        drop(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5], sys.argv[6])
    elif len(sys.argv) == 7 and sys.argv[1] == 'proxy':
        proxy(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5], sys.argv[6])
    else:
        raise SystemExit(__doc__)
