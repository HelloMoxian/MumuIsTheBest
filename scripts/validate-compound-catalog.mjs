import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "content", "chemistry", "compound-catalog.v1.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(catalog.schemaVersion === 1, "Compound catalog schemaVersion must be 1.");
invariant(catalog.assetId === "mumu-compound-catalog", "Compound catalog assetId is invalid.");
invariant(Array.isArray(catalog.records) && catalog.records.length === 518, "Compound catalog must contain 518 runtime records.");
invariant(new Set(catalog.records.map((record) => record.id)).size === catalog.records.length, "Compound catalog ids must be unique.");

const atlas = catalog.imageAtlas;
invariant(atlas && atlas.columns > 0 && atlas.rows > 0, "Compound image atlas metadata is missing.");
invariant(Array.isArray(atlas.cids) && new Set(atlas.cids).size === atlas.cids.length, "Compound image atlas CIDs must be unique.");
const atlasFile = path.join(root, "apps", "web", "public", atlas.path.replace(/^\//, ""));
await access(atlasFile);

for (const record of catalog.records) {
  invariant(typeof record.id === "string" && record.id.length > 0, "Compound id is required.");
  invariant(typeof record.formula === "string" && record.formula.length > 0, `${record.id}: formula is required.`);
  invariant(typeof record.displayFormula === "string" && record.displayFormula.length > 0, `${record.id}: display formula is required.`);
  invariant(typeof record.name === "string" && record.name.length > 0, `${record.id}: Chinese name is required.`);
  invariant(typeof record.nameEnglish === "string" && record.nameEnglish.length > 0, `${record.id}: English name is required.`);
  invariant(record.family === "organic" || record.family === "inorganic", `${record.id}: family is invalid.`);
  invariant(["molecule", "formula-unit", "allotrope", "hydrate", "intermetallic"].includes(record.kind), `${record.id}: kind is invalid.`);
  invariant(["acid", "base", "salt", "oxide", "allotrope", "simple-substance", "other"].includes(record.category), `${record.id}: category is invalid.`);
  invariant([0, 1, 2].includes(record.curriculumPriority), `${record.id}: curriculum priority is invalid.`);
  invariant(record.structure && Array.isArray(record.structure.atoms) && record.structure.atoms.length > 0, `${record.id}: atoms are required.`);
  invariant(Array.isArray(record.structure.bonds), `${record.id}: bonds are required.`);
  invariant(record.totalAtoms === record.structure.atoms.length, `${record.id}: totalAtoms does not match structure atoms.`);
  invariant(Object.values(record.atomCounts).every((count) => Number.isSafeInteger(count) && count > 0), `${record.id}: atomCounts must be positive integers.`);
  invariant(Object.values(record.atomCounts).reduce((total, count) => total + count, 0) === record.totalAtoms, `${record.id}: atomCounts total is invalid.`);
  invariant(record.profile && typeof record.profile.summary === "string", `${record.id}: profile summary is required.`);
  invariant(/[\u3400-\u9fff]/u.test(record.feature), `${record.id}: child-facing feature must contain Chinese text.`);
  invariant(/[\u3400-\u9fff]/u.test(record.profile.summary), `${record.id}: child-facing summary must contain Chinese text.`);
  invariant(typeof record.profile.composition === "string", `${record.id}: profile composition is required.`);
  invariant(typeof record.profile.classification === "string", `${record.id}: profile classification is required.`);
  invariant(typeof record.profile.structureNote === "string", `${record.id}: profile structure note is required.`);
  invariant(Array.isArray(record.profile.learningPoints) && record.profile.learningPoints.length >= 3, `${record.id}: at least three learning points are required.`);
  invariant(typeof record.profile.safetyNote === "string", `${record.id}: safety note is required.`);
  invariant(record.provenance?.source?.url, `${record.id}: source URL is required.`);
  if (record.cid) {
    invariant(record.profile.properties, `${record.id}: PubChem properties are required for CID ${record.cid}.`);
    invariant(record.image?.kind === "pubchem-atlas", `${record.id}: PubChem atlas image is required for CID ${record.cid}.`);
    invariant(record.image.atlasIndex >= 0 && record.image.atlasIndex < atlas.cids.length, `${record.id}: atlas index is out of range.`);
    invariant(atlas.cids[record.image.atlasIndex] === record.cid, `${record.id}: atlas index points to the wrong CID.`);
  }
}

const coveredElements = new Set(catalog.records.flatMap((record) => Object.keys(record.atomCounts)));
invariant(coveredElements.size >= 80, "Compound catalog must cover at least the first 80 element symbols.");
console.log(`Validated ${catalog.records.length} canonical compounds, ${atlas.cids.length} PubChem images and ${coveredElements.size} covered elements.`);
