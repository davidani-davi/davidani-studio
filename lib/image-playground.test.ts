import { describe, expect, it } from "vitest";
import {
  alphabeticImageLabel,
  appendUniqueReferences,
  orderSelectedReferenceUrls,
  parsePlaygroundPrompts,
  restorePersistedReferences,
} from "./image-playground";

describe("Image Playground helpers", () => {
  it("parses one trimmed prompt per non-empty line", () => {
    expect(parsePlaygroundPrompts(" first prompt \n\nsecond prompt\r\n")).toEqual([
      "first prompt",
      "second prompt",
    ]);
  });

  it("labels references with both single and multi-letter identifiers", () => {
    expect(alphabeticImageLabel(0)).toBe("A");
    expect(alphabeticImageLabel(25)).toBe("Z");
    expect(alphabeticImageLabel(26)).toBe("AA");
  });

  it("sends selected references in their visual library order", () => {
    const references = [
      { name: "first", url: "https://example.com/first.jpg" },
      { name: "second", url: "https://example.com/second.jpg" },
      { name: "third", url: "https://example.com/third.jpg" },
    ];

    expect(
      orderSelectedReferenceUrls(references, [
        "https://example.com/third.jpg",
        "https://example.com/first.jpg",
      ])
    ).toEqual([
      "https://example.com/first.jpg",
      "https://example.com/third.jpg",
    ]);
  });

  it("ignores saved selections that are no longer in the library", () => {
    expect(
      orderSelectedReferenceUrls(
        [{ name: "first", url: "https://example.com/first.jpg" }],
        ["https://example.com/missing.jpg"]
      )
    ).toEqual([]);
  });

  it("restores legacy references as selected and removes malformed entries", () => {
    expect(
      restorePersistedReferences(
        JSON.stringify([
          { name: "first", url: "https://example.com/first.jpg" },
          { name: "missing URL" },
          null,
        ]),
        null
      )
    ).toEqual({
      references: [{ name: "first", url: "https://example.com/first.jpg" }],
      selectedUrls: ["https://example.com/first.jpg"],
    });
  });

  it("restores only saved selections that still exist", () => {
    expect(
      restorePersistedReferences(
        JSON.stringify([
          { name: "first", url: "https://example.com/first.jpg" },
          { name: "second", url: "https://example.com/second.jpg" },
        ]),
        JSON.stringify([
          "https://example.com/second.jpg",
          "https://example.com/deleted.jpg",
        ])
      ).selectedUrls
    ).toEqual(["https://example.com/second.jpg"]);
  });

  it("treats malformed persisted collection shapes as empty", () => {
    expect(restorePersistedReferences(JSON.stringify({}), null)).toEqual({
      references: [],
      selectedUrls: [],
    });
    expect(
      restorePersistedReferences(
        JSON.stringify([{ name: "first", url: "https://example.com/first.jpg" }]),
        JSON.stringify({})
      ).selectedUrls
    ).toEqual([]);
  });

  it("appends new references without moving or duplicating existing ones", () => {
    expect(
      appendUniqueReferences(
        [{ name: "first", url: "https://example.com/first.jpg" }],
        [
          { name: "duplicate", url: "https://example.com/first.jpg" },
          { name: "second", url: "https://example.com/second.jpg" },
        ]
      )
    ).toEqual([
      { name: "first", url: "https://example.com/first.jpg" },
      { name: "second", url: "https://example.com/second.jpg" },
    ]);
  });

  it("keeps the first occurrence when one upload batch repeats a URL", () => {
    expect(
      appendUniqueReferences([], [
        { name: "first name", url: "https://example.com/repeated.jpg" },
        { name: "second name", url: "https://example.com/repeated.jpg" },
      ])
    ).toEqual([
      { name: "first name", url: "https://example.com/repeated.jpg" },
    ]);
  });

  it("returns an empty restored state when no reference library was saved", () => {
    expect(restorePersistedReferences(null, JSON.stringify(["orphan"]))).toEqual({
      references: [],
      selectedUrls: [],
    });
  });
});
