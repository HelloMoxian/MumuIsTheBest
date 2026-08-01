import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const webDistDirectory = path.join(rootDirectory, "apps", "web", "dist");
const sitesDistDirectory = path.join(rootDirectory, "dist");
const serverDirectory = path.join(sitesDistDirectory, "server");

const workerSource = `const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (
      response.status !== 404 ||
      request.method !== "GET" ||
      !acceptsHtml
    ) {
      return response;
    }

    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

export default worker;
`;

await readFile(path.join(webDistDirectory, "index.html"), "utf8");
await rm(sitesDistDirectory, { recursive: true, force: true });
await mkdir(serverDirectory, { recursive: true });
await cp(webDistDirectory, sitesDistDirectory, { recursive: true });
await writeFile(path.join(serverDirectory, "index.js"), workerSource, "utf8");

console.log("Prepared the Sites-compatible static build in dist/.");
