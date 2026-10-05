import { describe, expect, it, vi } from "vitest";
import { renderArticle } from "./featured";

vi.mock("server-only", () => ({}));

describe("renderArticle", () => {
  it("renders inline markdown in a paragraph", () => {
    expect(renderArticle("The **Next Test** app, in *italic* and `code`.")).toBe(
      "<p>The <strong>Next Test</strong> app, in <em>italic</em> and <code>code</code>.</p>\n",
    );
    expect(renderArticle("[SPUN](https://example.com/spun)")).toBe('<p><a href="https://example.com/spun">SPUN</a></p>\n');
  });

  it("escapes raw HTML", () => {
    expect(renderArticle('<script>alert("x")</script> <b>bold</b>')).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &lt;b&gt;bold&lt;/b&gt;</p>\n",
    );
  });

  it("turns a single newline into <br>, and a blank line into a new paragraph", () => {
    expect(renderArticle("one\ntwo\n\nthree")).toBe("<p>one<br>\ntwo</p>\n<p>three</p>\n");
  });

  it("does not make a link from javascript:", () => {
    const html = renderArticle("[click](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain('href="javascript:');
  });

  it("renders the setup's article as the e2e setup stores it", () => {
    expect(renderArticle("The **Next Test** app.")).toBe("<p>The <strong>Next Test</strong> app.</p>\n");
  });
});
