import { startServer } from "../../vendor/NBNtools/server/src/index.js";
import { mysqlCatalogue } from "./mysqlCatalogue.js";
import { spunServer } from "./SPUNServer.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing environment variable DATABASE_URL. See .env.example.");
}

startServer(spunServer(mysqlCatalogue(databaseUrl)));
