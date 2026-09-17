const {
  kDefaultFaviconUrl,
  normalizeAssetUrl,
  resolveBranding,
} = require("../../lib/server/branding");

describe("server/branding", () => {
  it("returns unchanged AlphaClaw branding by default", () => {
    expect(resolveBranding({})).toEqual({
      instanceName: "",
      faviconUrl: kDefaultFaviconUrl,
      documentTitle: "alphaclaw",
    });
  });

  it("resolves a named deployment with its favicon", () => {
    expect(
      resolveBranding({
        ALPHACLAW_INSTANCE_NAME: " Edna ",
        ALPHACLAW_FAVICON_URL: "/branding/edna.ico",
      }),
    ).toEqual({
      instanceName: "Edna",
      faviconUrl: "/branding/edna.ico",
      documentTitle: "Edna · AlphaClaw",
    });
  });

  it("rejects executable, insecure, and protocol-relative asset URLs", () => {
    expect(normalizeAssetUrl("javascript:alert(1)")).toBe(kDefaultFaviconUrl);
    expect(normalizeAssetUrl("http://assets.example.com/logo.png")).toBe(
      kDefaultFaviconUrl,
    );
    expect(normalizeAssetUrl("//assets.example.com/logo.png")).toBe(
      kDefaultFaviconUrl,
    );
  });
});
