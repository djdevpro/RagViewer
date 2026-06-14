import { describe, it, expect } from "vitest";
import {
  chunkDocument,
  chunkSemantic,
  CHUNK_PRESETS,
  DEFAULT_CHUNK_CONFIG,
  type ChunkConfig,
  type ChunkElement,
} from "./chunking";

const cfg = (over: Partial<ChunkConfig>): ChunkConfig => ({ ...DEFAULT_CHUNK_CONFIG, ...over });

const h = (id: string, text: string, level: number): ChunkElement => ({ id, type: "heading", text, level });
const t = (id: string, text: string): ChunkElement => ({ id, type: "text", text });

describe("annotate / heading path", () => {
  it("tracks the hierarchical heading path and never emits a chunk for a heading", () => {
    const els: ChunkElement[] = [
      h("h1", "Intro", 1),
      t("p1", "Para A"),
      h("h2", "Sub", 2),
      { id: "l1", type: "list_item", text: "Item1" },
      { id: "l2", type: "list_item", text: "Item2" },
      t("p2", "Para B"),
    ];
    const chunks = chunkDocument(els, cfg({ strategy: "structural", unit: "chars", maxSize: 1000, minSize: 0 }));
    expect(chunks).toHaveLength(3);
    expect(chunks[0].headingPath).toEqual(["Intro"]);
    expect(chunks[0].rawText).toBe("Para A");
    expect(chunks[1].headingPath).toEqual(["Intro", "Sub"]);
    expect(chunks[1].elementIds).toEqual(["l1", "l2"]); // list items merged
    expect(chunks[2].headingPath).toEqual(["Intro", "Sub"]);
    // no chunk references a heading element
    expect(chunks.flatMap((c) => c.elementIds)).not.toContain("h1");
  });
});

describe("contextualize", () => {
  it("prepends the heading path to the embedded text but keeps rawText clean", () => {
    const els = [h("h1", "Sec", 1), t("p1", "Body")];
    const [c] = chunkDocument(els, cfg({ strategy: "structural", unit: "chars", contextualize: "headingPath" }));
    expect(c.rawText).toBe("Body");
    expect(c.text).toBe("Sec\n\nBody");
  });

  it("emits a stable parentId per section when enabled", () => {
    const els = [h("h1", "Intro", 1), t("p1", "Body")];
    const [c] = chunkDocument(els, cfg({ strategy: "structural", emitParentLinks: true }));
    expect(c.parentId).toBe("sec:Intro");
  });
});

describe("hybrid strategy", () => {
  it("splits a section when it exceeds maxSize", () => {
    const els = [t("a", "aaaa"), t("b", "bbbb"), t("c", "cccc")];
    const chunks = chunkDocument(els, cfg({ strategy: "hybrid", unit: "chars", maxSize: 10, minSize: 0, contextualize: "none" }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].rawText).toBe("aaaa\n\nbbbb");
    expect(chunks[1].rawText).toBe("cccc");
  });

  it("keeps tables intact as their own chunk", () => {
    const els: ChunkElement[] = [t("a", "intro"), { id: "tb", type: "table", text: "BIGTABLE" }, t("b", "after")];
    const chunks = chunkDocument(els, cfg({ strategy: "hybrid", unit: "chars", maxSize: 1000, minSize: 0, contextualize: "none" }));
    const table = chunks.find((c) => c.type === "table");
    expect(table).toBeDefined();
    expect(table!.elementIds).toEqual(["tb"]);
  });

  it("mergePeers reduces chunk count for undersized same-section peers", () => {
    const els: ChunkElement[] = [t("a", "aaaaaaaa"), { id: "tb", type: "table", text: "T" }, t("b", "bb")];
    const base = { strategy: "hybrid" as const, unit: "chars" as const, maxSize: 1000, contextualize: "none" as const };
    const noMerge = chunkDocument(els, cfg({ ...base, minSize: 0 }));
    const merged = chunkDocument(els, cfg({ ...base, minSize: 5 }));
    expect(merged.length).toBeLessThan(noMerge.length);
  });
});

describe("recursive strategy", () => {
  it("splits on separators within the size budget", () => {
    const els = [t("a", "aaa bbb ccc ddd")];
    const chunks = chunkDocument(els, cfg({ strategy: "recursive", unit: "chars", maxSize: 10, overlap: 0, contextualize: "none" }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].rawText).toBe("aaa bbb");
    expect(chunks[1].rawText).toBe("ccc ddd");
  });
});

describe("fixed strategy", () => {
  it("produces overlapping fixed-size windows", () => {
    const els = [t("a", "abcdefghijklmnopqrst")]; // 20 chars
    const chunks = chunkDocument(els, cfg({ strategy: "fixed", unit: "chars", maxSize: 10, overlap: 0.5, contextualize: "none" }));
    expect(chunks).toHaveLength(3);
    expect(chunks[0].rawText).toBe("abcdefghij");
    expect(chunks[1].rawText).toBe("fghijklmno"); // 50% overlap → starts 5 chars in
  });
});

describe("semantic strategy", () => {
  it("breaks where the embedding distance spikes", async () => {
    const els = [t("a", "A. B. C. D.")];
    const vectors: Record<string, number[]> = {
      "A.": [1, 0],
      "B.": [1, 0],
      "C.": [0, 1],
      "D.": [0, 1],
    };
    const embed = async (texts: string[]) => texts.map((x) => vectors[x] ?? [0, 0]);
    const chunks = await chunkSemantic(
      els,
      cfg({ strategy: "semantic", unit: "chars", maxSize: 1000, semanticThreshold: 50, contextualize: "none" }),
      embed,
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].rawText).toBe("A. B.");
    expect(chunks[1].rawText).toBe("C. D.");
  });
});

describe("presets", () => {
  it("exposes the five strategies and a hybrid default", () => {
    expect(DEFAULT_CHUNK_CONFIG.strategy).toBe("hybrid");
    const strategies = Object.values(CHUNK_PRESETS).map((p) => p.strategy);
    expect(new Set(strategies)).toEqual(new Set(["structural", "hybrid", "recursive", "fixed", "semantic"]));
  });
});
