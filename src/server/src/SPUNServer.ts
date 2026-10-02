import type * as fs from "node:fs";
import * as path from "node:path";
import {
  Server,
  type Answer,
  type ServerClass,
  type Session,
} from "../../vendor/NBNtools/server/src/index.js";
import {
  FIND_PAGE_SIZE,
  INFO_CATEGORIES_MAX,
  INFO_PAGE_SIZE,
  LIST_PAGE_SIZE,
  pageCount,
  parseAppId,
  parsePage,
  parseSerial,
  zipAppId,
  type AppId,
  type Catalogue,
} from "./catalogue.js";
import { encodeChangelog, encodeError, encodeFind, encodeInfo } from "./codec.js";

export class SPUNServer extends Server {
  private readonly catalogue: Catalogue;
  private download: AppId | null = null;

  constructor(session: Session, catalogue: Catalogue) {
    super(session);
    this.catalogue = catalogue;
  }

  public override async command(cmd: string, params: readonly string[]): Promise<Answer> {
    switch (cmd) {
      case "SPFIND":
        return { bytes: await this.find(params) };
      case "SPLIST":
        return { bytes: await this.list(params) };
      case "SPINFO":
        return { bytes: await this.info(params) };
      case "SPCLOG":
        return { bytes: await this.changelog(params) };
      default:
        return super.command(cmd, params);
    }
  }

  protected override async sendFileDangerous(
    filename: string,
    absFile: string,
    stats: fs.Stats,
  ): Promise<Answer> {
    this.download = zipAppId(path.relative(this.session.config.FILEPATH, absFile));
    return super.sendFileDangerous(filename, absFile, stats);
  }

  // The client's "!" after the last block is the only sign of a complete
  // transfer: closeFile() also runs when the socket closes.
  protected override async acknowledge(): Promise<Answer> {
    if (this.state === "C" && this.download !== null) {
      const id = this.download;
      this.download = null;
      await this.catalogue.countDownload(id);
    }
    return super.acknowledge();
  }

  private async find(params: readonly string[]): Promise<Uint8Array> {
    const page = parsePage(params[0]);
    const text = params.slice(1).join(" ");
    if (page === null || text === "") {
      return encodeError("BadQuery_ERROR");
    }
    const found = await this.catalogue.find(text, (page - 1) * FIND_PAGE_SIZE, FIND_PAGE_SIZE);
    return encodeFind({
      total: found.total,
      page,
      pages: pageCount(found.total, FIND_PAGE_SIZE),
      apps: found.items,
    });
  }

  private async list(params: readonly string[]): Promise<Uint8Array> {
    const page = parsePage(params[0]);
    if (page === null) {
      return encodeError("BadQuery_ERROR");
    }
    const listed = await this.catalogue.list((page - 1) * LIST_PAGE_SIZE, LIST_PAGE_SIZE);
    return encodeFind({
      total: listed.total,
      page,
      pages: pageCount(listed.total, LIST_PAGE_SIZE),
      apps: listed.items,
    });
  }

  private async info(params: readonly string[]): Promise<Uint8Array> {
    const id = parseAppId(params[0] ?? "");
    if (id === null) {
      return encodeError("NoApp_ERROR");
    }
    const page = parsePage(params[1]);
    if (page === null) {
      return encodeError("BadQuery_ERROR");
    }
    const app = await this.catalogue.app(id);
    if (app === null) {
      return encodeError("NoApp_ERROR");
    }
    const releases = await this.catalogue.releases(id, (page - 1) * INFO_PAGE_SIZE, INFO_PAGE_SIZE);
    return encodeInfo({
      app: { ...app, categories: app.categories.slice(0, INFO_CATEGORIES_MAX) },
      total: releases.total,
      page,
      pages: pageCount(releases.total, INFO_PAGE_SIZE),
      releases: releases.items,
    });
  }

  private async changelog(params: readonly string[]): Promise<Uint8Array> {
    const id = parseAppId(params[0] ?? "");
    if (id === null) {
      return encodeError("NoApp_ERROR");
    }
    const serial = parseSerial(params[1]);
    if (serial === null) {
      return encodeError("BadQuery_ERROR");
    }
    if ((await this.catalogue.app(id)) === null) {
      return encodeError("NoApp_ERROR");
    }
    const release = await this.catalogue.changelog(id, serial);
    if (release === null) {
      return encodeError("NoRelease_ERROR");
    }
    return encodeChangelog(release);
  }
}

// startServer() constructs the server class with the session only.
export const spunServer = (catalogue: Catalogue): ServerClass =>
  class extends SPUNServer {
    constructor(session: Session) {
      super(session, catalogue);
    }
  };
