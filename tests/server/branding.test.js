const {
  kDefaultLogoUrl,
  normalizeAssetUrl,
  resolveBranding,
} = require("../../lib/server/branding");

describe("server/branding", () => {
  it("returns unchanged AlphaClaw branding by default", () => {
    expect(resolveBranding({})).toEqual({
      instanceName: "",
      logoUrl: kDefaultLogoUrl,
      faviconUrl: kDefaultLogoUrl,
      documentTitle: "alphaclaw",
    });
  });

  it("resolves a named deployment with independent logo and favicon", () => {
    expect(
      resolveBranding({
        ALPHACLAW_INSTANCE_NAME: " Edna ",
        ALPHACLAW_LOGO_URL: "https://assets.example.com/edna.png",
        ALPHACLAW_FAVICON_URL: "/branding/edna.ico",
      }),
    ).toEqual({
      instanceName: "Edna",
      logoUrl: "https://assets.example.com/edna.png",
      faviconUrl: "/branding/edna.ico",
      documentTitle: "Edna · AlphaClaw",
    });
  });

  it("rejects executable, insecure, and protocol-relative asset URLs", () => {
    expect(normalizeAssetUrl("javascript:alert(1)")).toBe(kDefaultLogoUrl);
    expect(normalizeAssetUrl("http://assets.example.com/logo.png")).toBe(
      kDefaultLogoUrl,
    );
    expect(normalizeAssetUrl("//assets.example.com/logo.png")).toBe(
      kDefaultLogoUrl,
    );
  });
});
