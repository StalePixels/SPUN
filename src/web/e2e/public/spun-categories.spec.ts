import { liveCategoriesByName } from "../support/db";
import { test, expect } from "../support/searchData";
import { spun, type SpunReply } from "../support/spunServer";

// SPCATS and SPCAT against the e2e SPUNServer and its real MariaDB.
// The data comes from the searchData fixture.

function ok(reply: SpunReply) {
  if (reply.error !== null) throw new Error(`Server said ${reply.error}`);
  return reply;
}

test("SPCATS lists every live category in name order, and none that is deleted", async ({ data }) => {
  const want = await liveCategoriesByName();
  const got = [];
  let page = 1;
  for (;;) {
    const reply = ok(await spun(`SPCATS ${page}`));
    expect(reply.total).toBe(want.length);
    expect(reply.page).toBe(page);
    expect(reply.categories.length).toBeLessThanOrEqual(20);
    got.push(...reply.categories);
    if (page >= reply.pages) break;
    page += 1;
  }
  expect(got).toEqual(want);
  const slugs = got.map((category) => category.slug);
  expect(slugs).toContain(data.one.slug);
  expect(slugs).toContain(data.two.slug);
  expect(slugs).not.toContain(data.gone.slug);
  const seeded = ["apps", "basic", "demos", "games", "music", "other", "systool"];
  expect(slugs.filter((slug) => seeded.includes(slug))).toEqual(seeded);
});

test("SPCATS with no page is page 1, and a bad page is an error", async () => {
  const first = ok(await spun("SPCATS"));
  expect(first.page).toBe(1);
  expect(ok(await spun("SPCATS 1")).categories).toEqual(first.categories);
  const bad = await spun("SPCATS x");
  expect(bad.error).toMatch(/_ERROR/);
});

test("SPCAT lists the public apps of one category only", async ({ data }) => {
  const one = ok(await spun(`SPCAT ${data.one.slug} 1`));
  expect(one.apps).toEqual([data.inOne.id]);
  expect(one.total).toBe(1);
  expect(one.pages).toBe(1);
  const two = ok(await spun(`SPCAT ${data.two.slug} 1`));
  expect(two.apps).toEqual([data.inTwo.id]);
});

test("SPCAT with text searches inside the category", async ({ data }) => {
  const title = ok(await spun(`SPCAT ${data.one.slug} 1 ${data.titleWord}`));
  expect(title.apps).toEqual([data.inOne.id]);
  const description = ok(await spun(`SPCAT ${data.one.slug} 1 ${data.descriptionWord}`));
  expect(description.apps).toEqual([data.inOne.id]);
  const other = ok(await spun(`SPCAT ${data.two.slug} 1 ${data.descriptionWord}`));
  expect(other.apps).toEqual([]);
  expect(other.total).toBe(0);
  const inTwo = ok(await spun(`SPCAT ${data.two.slug} 1 ${data.titleWord}`));
  expect(inTwo.apps).toEqual([data.inTwo.id]);
});

test("SPCAT gives an error for an unknown, deleted or malformed slug and for a bad page", async ({ data }) => {
  for (const command of [
    "SPCAT no-such-cat 1",
    `SPCAT ${data.gone.slug} 1`,
    "SPCAT BAD_SLUG 1",
    `SPCAT ${data.one.slug}`,
    `SPCAT ${data.one.slug} x`,
    "SPCAT",
  ]) {
    const reply = await spun(command);
    expect(reply.error, command).toMatch(/_ERROR/);
  }
});
