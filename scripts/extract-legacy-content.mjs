import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../legacy/web/source.fragment.html", import.meta.url);
const outputUrl = new URL("../content/flashcards.json", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

const declaration = "const flashcards = ";
const start = source.indexOf(declaration);
const endMarker = "].map(([id, branch, q, a, deep])";
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate the legacy flashcard catalog.");
}

const literal = source.slice(start + declaration.length, end + 1);
const rows = Function(`"use strict"; return (${literal});`)();

if (!Array.isArray(rows) || rows.length !== 150) {
  throw new Error(`Expected 150 flashcards, found ${rows?.length ?? "invalid"}.`);
}

const cards = rows.map(([id, branch, prompt, answer, deepDive]) => ({
  id,
  branch,
  prompt,
  answer,
  deepDive,
}));
const ids = new Set(cards.map((card) => card.id));
if (ids.size !== cards.length) {
  throw new Error("Flashcard identifiers must be unique.");
}
const prompts = new Set(cards.map((card) => card.prompt));
if (prompts.size !== cards.length) {
  throw new Error("Flashcard prompts must be unique.");
}

const catalog = {
  schemaVersion: 1,
  generatedFrom: "legacy/web/source.fragment.html@getOPS-v2",
  cards,
};

await writeFile(outputUrl, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${cards.length} flashcards to ${outputUrl.pathname}`);
