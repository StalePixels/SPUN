import { test as base } from "@playwright/test";
import { uniqueSlug } from "./categories";
import {
  insertApp,
  insertCategory,
  insertRelease,
  insertUser,
  linkCategory,
  markAppDeleted,
  markCategoryDeleted,
  removeCategories,
  removeTestUser,
} from "./db";

// For the public project: a user, categories and apps inserted straight into
// the database, so no app limit applies, and removed at the end.
//
// titleWord is in the title of all three apps; descriptionWord only in the
// description of inOne. inOne is in category one, inTwo in category two, and
// deleted is in category one but deleted. gone is a deleted category.
export type SearchData = {
  owner: { id: string; username: string };
  titleWord: string;
  descriptionWord: string;
  one: { id: number; slug: string; name: string };
  two: { id: number; slug: string; name: string };
  gone: { id: number; slug: string };
  inOne: { id: string; title: string };
  inTwo: { id: string; title: string };
  deleted: { id: string; title: string };
};

function stamp(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const test = base.extend<{ data: SearchData }>({
  data: [
    async ({}, provide) => {
      const made: number[] = [];
      let ownerId: string | null = null;
      try {
        const base = uniqueSlug();
        const category = async (label: string) => {
          const slug = `${base}-${made.length}`;
          const name = `E2E ${label} ${slug}`.slice(0, 32);
          const id = await insertCategory(slug, name);
          made.push(id);
          return { id, slug, name };
        };
        const one = await category("One");
        const two = await category("Two");
        const gone = await category("Gone");
        await markCategoryDeleted(gone.id);

        const username = `E2E-${stamp()}`.slice(0, 16);
        ownerId = await insertUser(username);
        const owner = { id: ownerId, username };
        const titleWord = `t${stamp()}`;
        const descriptionWord = `d${stamp()}`;
        const app = async (label: string, categoryId: number, description = "") => {
          const title = `E2E ${titleWord} ${label}`;
          const id = await insertApp(owner.id, title, description);
          await insertRelease(id, 1, "1.0");
          await linkCategory(id, categoryId);
          return { id, title };
        };
        const inOne = await app("A", one.id, `Has ${descriptionWord} in it`);
        await insertRelease(inOne.id, 2, "1.1");
        const inTwo = await app("B", two.id);
        const deleted = await app("C", one.id);
        await markAppDeleted(deleted.id);

        await provide({ owner, titleWord, descriptionWord, one, two, gone, inOne, inTwo, deleted });
      } finally {
        if (ownerId) await removeTestUser(ownerId);
        await removeCategories(made);
      }
    },
    { timeout: 30_000 },
  ],
});

export { expect } from "@playwright/test";
