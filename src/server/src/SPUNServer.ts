import {
  log,
  Server,
  type ServerClass,
  type Session,
} from "../../vendor/NBNtools/server/src/index.js";
import {
  FIND_PAGE_SIZE,
  INFO_PAGE_SIZE,
  pageCount,
  parseAppId,
  parsePage,
  type Catalogue,
} from "./catalogue.js";
import { encodeError, encodeFind, encodeInfo } from "./codec.js";

export class SPUNServer extends Server {
  private readonly catalogue: Catalogue;

  constructor(session: Session, catalogue: Catalogue) {
    super(session);
    this.catalogue = catalogue;
  }

  public override command(cmd: string, params: readonly string[]): void {
    switch (cmd) {
      case "FIND":
        this.reply(this.find(params));
        break;
      case "INFO":
        this.reply(this.info(params));
        break;
      default:
        super.command(cmd, params);
    }
  }

  private reply(answer: Promise<Uint8Array>): void {
    answer.then(
      (bytes) => this.session.socket.write(bytes),
      (err: unknown) => {
        log(err);
        this.session.end("ServerException_ERROR");
      },
    );
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
      app,
      total: releases.total,
      page,
      pages: pageCount(releases.total, INFO_PAGE_SIZE),
      releases: releases.items,
    });
  }
}

// startServer() constructs the server class with the session only.
export const spunServer = (catalogue: Catalogue): ServerClass =>
  class extends SPUNServer {
    constructor(session: Session) {
      super(session, catalogue);
    }
  };
