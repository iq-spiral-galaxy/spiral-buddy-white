// Markdown 안의 수식 구분자를 KaTeX tokenizer가 이해하는 형태로 정규화한다.
// 코드 펜스와 인라인 코드는 원문을 그대로 보존한다.

function countRun(text, start, char) {
  let end = start;
  while (text[end] === char) end += 1;
  return end - start;
}

function isCurrencyDollar(text, index) {
  if (text[index] !== "$" || text[index + 1] === "$") return false;
  const tail = text.slice(index + 1);
  const match = tail.match(/^\d[\d,]*(?:\.\d+)?/);
  if (!match) return false;
  const after = tail[match[0].length] ?? "";
  // 닫는 $가 바로 오면 수식이다. 숫자 뒤에 자연어·공백·문장부호가
  // 오거나 문자열이 끝나면 통화 표기로 보고 dollar를 escape한다.
  if (after === "$") return false;
  const lineEnd = text.indexOf("\n", index + 1);
  const searchEnd = lineEnd === -1 ? text.length : lineEnd;
  let closing = -1;
  for (let cursor = index + 1; cursor < searchEnd; cursor += 1) {
    if (text[cursor] === "$" && text[cursor - 1] !== "\\") {
      closing = cursor;
      break;
    }
  }
  if (closing !== -1) {
    const candidate = text.slice(index + 1, closing);
    // 숫자로 시작하는 실제 식($5 + x$, $2^n$ 등)은 통화로 오인하지 않는다.
    if (/[\\^_{}=+*/<>]|(?:->|<=|>=)/.test(candidate)) return false;
  }
  return (
    after === "" ||
    /[\s가-힣A-Za-z,.;:!?)]/.test(after)
  );
}

export function normalizeMathDelimiters(value) {
  const text = String(value ?? "");
  let output = "";
  let index = 0;
  let lineStart = true;
  let fenceChar = "";
  let fenceLength = 0;
  let inlineTicks = 0;

  while (index < text.length) {
    const char = text[index];

    if (lineStart && inlineTicks === 0) {
      let markerIndex = index;
      while (
        markerIndex < text.length &&
        markerIndex - index < 3 &&
        text[markerIndex] === " "
      ) {
        markerIndex += 1;
      }
      const marker = text[markerIndex];
      if (marker === "`" || marker === "~") {
        const run = countRun(text, markerIndex, marker);
        if (run >= 3) {
          const isClosing =
            fenceChar === marker && run >= fenceLength;
          const isOpening = !fenceChar;
          if (isOpening) {
            fenceChar = marker;
            fenceLength = run;
          } else if (isClosing) {
            fenceChar = "";
            fenceLength = 0;
          }
          if (isOpening || isClosing) {
            const markerEnd = markerIndex + run;
            output += text.slice(index, markerEnd);
            index = markerEnd;
            lineStart = false;
            continue;
          }
        }
      }
    }

    if (!fenceChar && char === "`") {
      const run = countRun(text, index, "`");
      if (inlineTicks === 0) inlineTicks = run;
      else if (run === inlineTicks) inlineTicks = 0;
      output += text.slice(index, index + run);
      index += run;
      lineStart = false;
      continue;
    }

    if (!fenceChar && inlineTicks === 0) {
      const escapedByBackslash = index > 0 && text[index - 1] === "\\";
      if (!escapedByBackslash && text.startsWith("\\[", index)) {
        output += "$$";
        index += 2;
        lineStart = false;
        continue;
      }
      if (!escapedByBackslash && text.startsWith("\\]", index)) {
        output += "$$";
        index += 2;
        lineStart = false;
        continue;
      }
      if (!escapedByBackslash && text.startsWith("\\(", index)) {
        output += "$";
        index += 2;
        lineStart = false;
        continue;
      }
      if (!escapedByBackslash && text.startsWith("\\)", index)) {
        output += "$";
        index += 2;
        lineStart = false;
        continue;
      }
      if (
        char === "$" &&
        (index === 0 || text[index - 1] !== "\\") &&
        isCurrencyDollar(text, index)
      ) {
        output += "\\$";
        index += 1;
        lineStart = false;
        continue;
      }
    }

    output += char;
    index += 1;
    lineStart = char === "\n";
  }

  return output;
}
