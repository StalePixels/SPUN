import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  FEATURED,
  type AppId,
  type AppName,
  type Catalogue,
  type Changelog,
  type FoundApp,
  type Release,
  type Screenshot,
} from "./catalogue.js";

const PUBLIC = `a.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM releases WHERE app_id = a.id AND deleted_at IS NULL)`;

const MATCH = `${PUBLIC}
  AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;

const FOUND = `SELECT a.id, u.username, a.title, r.serial, r.version, a.downloads
  FROM apps a
  JOIN users u ON u.id = a.user_id
  JOIN releases r ON r.app_id = a.id AND r.serial = (
    SELECT MAX(serial) FROM releases WHERE app_id = a.id AND deleted_at IS NULL)`;

function likePattern(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

const foundApp = (row: RowDataPacket): FoundApp => ({
  id: row.id as AppId,
  username: row.username,
  title: row.title,
  latest: { serial: row.serial, version: row.version },
  downloads: Number(row.downloads),
});

export function mysqlCatalogue(uri: string): Catalogue {
  const pool = mysql.createPool({ uri, dateStrings: true });

  return {
    async resolve(name: AppName) {
      if (name === FEATURED) {
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT f.app_id AS id
           FROM features f
           JOIN apps a ON a.id = f.app_id
           WHERE f.published AND f.deleted_at IS NULL AND f.publish_at <= NOW() AND ${PUBLIC}
           ORDER BY f.publish_at DESC, f.id DESC
           LIMIT 1`,
        );
        return rows.length === 0 ? null : ((rows[0].id as string).toLowerCase() as AppId);
      }
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM apps WHERE id = ?
         UNION ALL
         SELECT app_id AS id FROM aliases WHERE alias = ?`,
        [name, name],
      );
      return rows.length === 0 ? null : ((rows[0].id as string).toLowerCase() as AppId);
    },

    async find(text, offset, limit) {
      const pattern = likePattern(text);
      const [[count]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM apps a WHERE ${MATCH}`,
        [pattern, pattern],
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        `${FOUND}
         WHERE ${MATCH}
         ORDER BY a.title, a.id
         LIMIT ? OFFSET ?`,
        [pattern, pattern, limit, offset],
      );
      return { total: Number(count.total), items: rows.map(foundApp) };
    },

    async list(offset, limit) {
      const [[count]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM apps a WHERE ${PUBLIC}`,
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        `${FOUND}
         WHERE ${PUBLIC}
         ORDER BY r.release_date DESC, a.title, a.id
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      return { total: Number(count.total), items: rows.map(foundApp) };
    },

    async app(id) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT u.username, a.title, a.description, a.downloads, a.install_dir
         FROM apps a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = ? AND ${PUBLIC}`,
        [id],
      );
      if (rows.length === 0) {
        return null;
      }
      const [categories] = await pool.query<RowDataPacket[]>(
        `SELECT c.name
         FROM app_categories ac
         JOIN categories c ON c.id = ac.category_id
         WHERE ac.app_id = ? AND c.deleted_at IS NULL
         ORDER BY c.name, c.id`,
        [id],
      );
      const [screenshots] = await pool.query<RowDataPacket[]>(
        "SELECT slot, width FROM screenshots WHERE app_id = ? ORDER BY slot",
        [id],
      );
      const [app] = rows;
      return {
        id,
        username: app.username,
        title: app.title,
        description: app.description,
        downloads: Number(app.downloads),
        categories: categories.map((row) => row.name as string),
        screenshots: screenshots as Screenshot[],
        installDir: app.install_dir,
      };
    },

    async releases(id, offset, limit) {
      const [[count]] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM releases WHERE app_id = ? AND deleted_at IS NULL",
        [id],
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT serial, version, release_date AS date
         FROM releases
         WHERE app_id = ? AND deleted_at IS NULL
         ORDER BY serial DESC
         LIMIT ? OFFSET ?`,
        [id, limit, offset],
      );
      return { total: Number(count.total), items: rows as Release[] };
    },

    async changelog(id, serial) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT serial, version, release_date AS date, changelog
         FROM releases
         WHERE app_id = ? AND serial = ? AND deleted_at IS NULL`,
        [id, serial],
      );
      return rows.length === 0 ? null : (rows[0] as Changelog);
    },

    async countDownload(id) {
      await pool.query("UPDATE apps SET downloads = downloads + 1 WHERE id = ?", [id]);
    },
  };
}
