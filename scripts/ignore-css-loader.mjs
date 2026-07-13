import { createRequire } from "node:module";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const emptyStylesheet = "data:text/javascript,export default {};";
const requireFromProject = createRequire(pathToFileURL(`${process.cwd()}/package.json`));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".css")) {
    return {
      shortCircuit: true,
      url: emptyStylesheet
    };
  }

  if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(specifier)) {
    const assetUrl = new URL(specifier, context.parentURL);
    const publicPath = `/files/${basename(assetUrl.pathname)}`;
    return {
      shortCircuit: true,
      url: `data:text/javascript,export default ${JSON.stringify(publicPath)};`
    };
  }

  if (specifier === "react-dom" && context.parentURL?.includes("animal-island-ui")) {
    return {
      shortCircuit: true,
      url: pathToFileURL(requireFromProject.resolve(specifier)).href
    };
  }

  return nextResolve(specifier, context);
}
