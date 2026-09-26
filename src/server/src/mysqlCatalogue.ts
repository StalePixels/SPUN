import mysql, { type RowDataPacket } from "mysql2/promise";
import type { AppId, AppInfo, Catalogue, FoundApp, Release } from "./catalogue.js";

const MATCH = `a.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM releases WHERE app_id = a.id AND deleted_at IS NULL)
  AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;

function likePattern(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

export function mysqlCatalogue(uri: string): Catalogue {
  const pool = mysql.createPool({ uri, dateStrings: true });

  return {
    async find(text, offset, limit) {
      const pattern = likePattern(text);
      const [[count]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM apps a WHERE ${MATCH}`,
        [pattern, pattern],
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, u.username, a.title, r.serial, r.version
         FROM apps a
         JOIN users u ON u.id = a.user_id
         JOIN releases r ON r.app_id = a.id AND r.serial = (
           SELECT MAX(serial) FROM releases WHERE app_id = a.id AND deleted_at IS NULL)
         WHERE ${MATCH}
         ORDER BY a.title, a.id
         LIMIT ? OFFSET ?`,
        [pattern, pattern, limit, offset],
      );
      const items: FoundApp[] = rows.map((row) => ({
        id: row.id as AppId,
        username: row.username,
        title: row.title,
        latest: { serial: row.serial, version: row.version },
      }));
      return { total: Number(count.total), items };
    },

    async app(id) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT u.username, a.title, a.description
         FROM apps a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = ? AND a.deleted_at IS NULL`,
        [id],
      );
      return rows.length === 0 ? null : (rows[0] as AppInfo);
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
  };
}
