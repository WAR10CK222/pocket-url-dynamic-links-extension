import { escapeHtml, renderLinkPage, renderNotFoundPage, renderTemplate, safeJson } from "../../src/redirect/render";
import { testConfig } from "../helpers";

describe("renderTemplate", () => {
    it("escapes HTML in {{placeholders}}", () => {
        const out = renderTemplate("<p>{{v}}</p>", { v: "<script>alert(\"x\")</script>&'" });
        expect(out).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;</p>");
    });

    it("inserts $& and $1 literally instead of as replacement patterns", () => {
        expect(renderTemplate("{{a}}|{{b}}", { a: "$&", b: "$1$$" })).toBe("$&amp;|$1$$");
    });

    it("leaves {{{raw}}} values unescaped and missing values empty", () => {
        expect(renderTemplate("{{{r}}}{{missing}}", {}, { r: "<b>ok</b>" })).toBe("<b>ok</b>");
    });
});

describe("safeJson", () => {
    it("can't close a script element or start a comment", () => {
        const json = safeJson({ url: "</script><!--<script>alert(1)" });
        expect(json).not.toMatch(/<\/script/i);
        expect(json).not.toContain("<!--");
        expect(JSON.parse(json).url).toBe("</script><!--<script>alert(1)");
    });
});

describe("renderLinkPage", () => {
    const config = testConfig();
    const link = {
        redirectUrl: "https://acme.com/a",
        og: { title: "\"><script>alert(1)</script>", description: "desc", image: "https://cdn.acme.com/i.png" },
    };

    it("escapes OG values and embeds config as JSON", () => {
        const html = renderLinkPage({
            link,
            decision: { kind: "preview", destination: "https://acme.com/a" },
            config,
            appStoreId: "123",
            shortUrl: "https://acme-links.web.app/x",
        });
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).toContain("<meta property=\"og:image\" content=\"https://cdn.acme.com/i.png\">");
        expect(html).toContain("<meta name=\"twitter:site\" content=\"@acme\">");
        expect(html).toContain("app-id=123");
        expect(html).toContain("\"mode\":\"preview\"");
    });

    it("never interpolates a javascript: URL into the inline script", () => {
        const html = renderLinkPage({
            link: { redirectUrl: "javascript:alert(1)" },
            decision: { kind: "preview", destination: "https://acme.com" },
            config,
            appStoreId: "",
            shortUrl: "https://acme-links.web.app/x",
        });
        expect(html).not.toContain("javascript:alert(1)");
    });
});

describe("renderNotFoundPage", () => {
    it("links back to the site", () => {
        expect(renderNotFoundPage(testConfig())).toContain("href=\"https://acme.com\"");
    });

    it("escapeHtml handles all five characters", () => {
        expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
    });
});
