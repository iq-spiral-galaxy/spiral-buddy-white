import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMathDelimiters } from "../client/math.js";

describe("math delimiter normalization", () => {
  test("normalizes TeX delimiters used by common model outputs", () => {
    assert.equal(
      normalizeMathDelimiters("인라인 \\(a^2+b^2=c^2\\) 식"),
      "인라인 $a^2+b^2=c^2$ 식",
    );
    assert.equal(
      normalizeMathDelimiters("전개\n\\[\n\\sum_{i=1}^n i\n\\]\n끝"),
      "전개\n$$\n\\sum_{i=1}^n i\n$$\n끝",
    );
  });

  test("never rewrites delimiters inside inline or fenced code", () => {
    const source = [
      "`\\(literal\\)`",
      "",
      "```tex",
      "\\[x^2\\]",
      "```",
      "",
      "밖에서는 \\(x^2\\)",
    ].join("\n");
    assert.equal(
      normalizeMathDelimiters(source),
      [
        "`\\(literal\\)`",
        "",
        "```tex",
        "\\[x^2\\]",
        "```",
        "",
        "밖에서는 $x^2$",
      ].join("\n"),
    );
  });

  test("protects currency without breaking equations that start with a number", () => {
    assert.equal(
      normalizeMathDelimiters("비용은 $5 또는 $10입니다."),
      "비용은 \\$5 또는 \\$10입니다.",
    );
    assert.equal(
      normalizeMathDelimiters("식은 $5 + x = 9$ 이다."),
      "식은 $5 + x = 9$ 이다.",
    );
    assert.equal(normalizeMathDelimiters("$2026$"), "$2026$");
  });

  test("preserves deliberately escaped delimiters", () => {
    assert.equal(
      normalizeMathDelimiters(String.raw`literal \\(x\\), math \(y\)`),
      String.raw`literal \\(x\\), math $y$`,
    );
  });
});
