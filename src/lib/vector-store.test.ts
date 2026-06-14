import { describe, it, expect } from "vitest";
import { parseQdrant } from "./vector-store";

describe("parseQdrant", () => {
  it("keeps the url and uses the separately provided api key", () => {
    expect(parseQdrant("https://h.cloud.qdrant.io:6333", "KEY")).toEqual({
      url: "https://h.cloud.qdrant.io:6333",
      apiKey: "KEY",
    });
  });

  it("extracts the api key from userinfo password", () => {
    expect(parseQdrant("https://user:SECRET@h:6333")).toEqual({ url: "https://h:6333", apiKey: "SECRET" });
  });

  it("extracts the api key from a bare username when no password", () => {
    expect(parseQdrant("https://SECRET@h:6333")).toEqual({ url: "https://h:6333", apiKey: "SECRET" });
  });

  it("extracts the api key from a query param and strips it", () => {
    expect(parseQdrant("https://h:6333/?api_key=ZZZ")).toEqual({ url: "https://h:6333", apiKey: "ZZZ" });
  });

  it("strips a trailing slash", () => {
    expect(parseQdrant("https://h:6333/")).toEqual({ url: "https://h:6333", apiKey: "" });
  });
});
